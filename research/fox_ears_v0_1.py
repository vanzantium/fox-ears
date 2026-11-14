#!/usr/bin/env python3
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Tuple, Optional, Sequence
import math, json, argparse, unittest
from pathlib import Path

VERSION="fox-ears-0.1"
BANDS_HZ=(125,250,500,1000,2000,4000,8000)

def clamp(x,lo=0.0,hi=1.0): return max(lo,min(hi,float(x)))
def vec_sub(a,b): return tuple(x-y for x,y in zip(a,b))
def norm(v): return math.sqrt(sum(x*x for x in v))
def unit(v):
    n=norm(v) or 1.0
    return tuple(x/n for x in v)
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def angle_deg(a,b):
    c=max(-1.0,min(1.0,dot(unit(a),unit(b))))
    return math.degrees(math.acos(c))

@dataclass(frozen=True)
class AuditorySource:
    source_id:str
    position:Tuple[float,float,float]
    spectrum:Dict[int,float]
    base_level:float
    onset_ms:int
    offset_ms:int
    modulation_hz:float=0.0
    modulation_depth:float=0.0
    phase_rad:float=0.0
    def active(self,t): return self.onset_ms<=t<=self.offset_ms
    def envelope(self,t):
        if not self.active(t): return 0.0
        attack=clamp((t-self.onset_ms)/30.0)
        release=clamp((self.offset_ms-t)/80.0)
        env=min(attack,release,1.0)
        if self.modulation_hz>0 and self.modulation_depth>0:
            sec=t/1000.0
            mod=1.0-self.modulation_depth*0.5+self.modulation_depth*0.5*(1+math.sin(2*math.pi*self.modulation_hz*sec+self.phase_rad))/2
            env*=mod
        return clamp(env)

@dataclass(frozen=True)
class Reflection:
    reflection_id:str
    source_id:str
    delay_ms:float
    attenuation:float
    direction:Tuple[float,float,float]

@dataclass
class Room:
    reflections:List[Reflection]=field(default_factory=list)
    noise_spectrum:Dict[int,float]=field(default_factory=lambda:{b:0.0 for b in BANDS_HZ})

@dataclass
class EarPose:
    position:Tuple[float,float,float]
    forward:Tuple[float,float,float]

@dataclass
class HeadState:
    head_forward:Tuple[float,float,float]=(0,1,0)
    left_ear_yaw_deg:float=0.0
    right_ear_yaw_deg:float=0.0
    ear_half_spacing_m:float=0.09
    def ears(self):
        def yaw(v,deg):
            x,y,z=v; a=math.radians(deg)
            return (x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),z)
        return (
            EarPose((-self.ear_half_spacing_m,0,0),yaw(self.head_forward,self.left_ear_yaw_deg)),
            EarPose(( self.ear_half_spacing_m,0,0),yaw(self.head_forward,self.right_ear_yaw_deg)),
        )

@dataclass(frozen=True)
class PathContribution:
    path_id:str
    source_id:str
    ear:str
    arrival_ms:float
    level:float
    spectrum:Dict[int,float]
    direct:bool

class AcousticPropagation:
    SPEED_OF_SOUND=343.0
    def _ear_gain(self,ear,source_pos):
        ang=angle_deg(ear.forward,vec_sub(source_pos,ear.position))
        return clamp(0.45+0.55*max(0.0,math.cos(math.radians(ang))))
    def _path(self,src,ear_name,ear,t_ms,position,delay_extra_ms=0.0,attenuation=1.0,path_id="direct",direct=True):
        d=max(0.05,norm(vec_sub(position,ear.position)))
        travel=d/self.SPEED_OF_SOUND*1000.0+delay_extra_ms
        env=src.envelope(int(t_ms-travel))
        if env<=0: return None
        dg=1.0/(1.0+d*d*0.35)
        eg=self._ear_gain(ear,position)
        lvl=clamp(src.base_level*env*dg*eg*attenuation)
        spec={b:clamp(src.spectrum.get(b,0.0)*lvl) for b in BANDS_HZ}
        return PathContribution(path_id,src.source_id,ear_name,travel,lvl,spec,direct)
    def sample(self,sources,room,head,t_ms):
        left,right=head.ears(); ears={"L":left,"R":right}; out=[]
        for src in sources:
            for ename,ear in ears.items():
                p=self._path(src,ename,ear,t_ms,src.position,path_id=f"{src.source_id}:direct",direct=True)
                if p: out.append(p)
            for refl in room.reflections:
                if refl.source_id!=src.source_id: continue
                rpos=tuple(x*1.5 for x in unit(refl.direction))
                for ename,ear in ears.items():
                    p=self._path(src,ename,ear,t_ms,rpos,refl.delay_ms,refl.attenuation,refl.reflection_id,False)
                    if p: out.append(p)
        return out

@dataclass(frozen=True)
class EarFrame:
    t_ms:int
    ear:str
    total_level:float
    bands:Dict[int,float]
    onset_energy:float
    continuity:float

@dataclass(frozen=True)
class BinauralFrame:
    t_ms:int
    left_level:float
    right_level:float
    level_delta_lr:float
    estimated_itd_ms:float
    spectral_delta:float
    continuity:float
    foreground_confidence:float
    silence_event:bool

class EarTransducer:
    def __init__(self): self.prev={}
    def transduce(self,contribs,room,t_ms,ear):
        bands={b:clamp(room.noise_spectrum.get(b,0.0)) for b in BANDS_HZ}
        for p in contribs:
            if p.ear!=ear: continue
            for b in BANDS_HZ:
                bands[b]=clamp(math.sqrt(bands[b]**2+p.spectrum.get(b,0.0)**2))
        lvl=clamp(math.sqrt(sum(v*v for v in bands.values())/len(BANDS_HZ)))
        prev=self.prev.get(ear)
        onset=lvl if prev is None else clamp(max(0.0,lvl-prev.total_level)*3.0)
        cont=0.0 if prev is None else clamp(1.0-abs(lvl-prev.total_level)*2.0)
        fr=EarFrame(t_ms,ear,lvl,bands,onset,cont); self.prev[ear]=fr; return fr

class BinauralIntegrator:
    def relate(self,left,right,contribs):
        direct=[p for p in contribs if p.direct]
        itd=0.0
        by_src={}
        for p in direct: by_src.setdefault(p.source_id,{})[p.ear]=p
        best=None; best_e=-1
        for d in by_src.values():
            if "L" in d and "R" in d:
                e=d["L"].level+d["R"].level
                if e>best_e: best_e=e; best=d
        if best: itd=best["R"].arrival_ms-best["L"].arrival_ms
        spec=sum(abs(left.bands[b]-right.bands[b]) for b in BANDS_HZ)/len(BANDS_HZ)
        cont=(left.continuity+right.continuity)/2
        fg=clamp(max(left.total_level,right.total_level)*0.75+max(left.onset_energy,right.onset_energy)*0.25)
        return BinauralFrame(left.t_ms,left.total_level,right.total_level,left.total_level-right.total_level,itd,spec,cont,fg,len(contribs)==0)

@dataclass
class AuditoryObject:
    anonymous_id:str
    last_seen_ms:int
    spectral_signature:Dict[int,float]
    level:float
    continuity_score:float
    spatial_hypothesis:str
    confidence:float
    status:str="ACTIVE"
    provenance_paths:List[str]=field(default_factory=list)

class ObjectBinder:
    def __init__(self): self.source_to_anon={}; self.objects={}; self.counter=0
    def _anon(self,sid):
        if sid not in self.source_to_anon:
            self.counter+=1; self.source_to_anon[sid]=f"A{self.counter:03d}"
        return self.source_to_anon[sid]
    def update(self,contribs,binaural,t_ms):
        seen=set(); grouped={}
        for p in contribs: grouped.setdefault(p.source_id,[]).append(p)
        for sid,ps in grouped.items():
            aid=self._anon(sid); seen.add(aid)
            spec={b:0.0 for b in BANDS_HZ}
            for p in ps:
                for b in BANDS_HZ: spec[b]=max(spec[b],p.spectrum.get(b,0.0))
            lvl=max((p.level for p in ps),default=0.0)
            spatial="center/uncertain"
            by_ear={p.ear:p for p in ps if p.direct}
            if "L" in by_ear and "R" in by_ear:
                local_itd=by_ear["R"].arrival_ms-by_ear["L"].arrival_ms
                local_ild=by_ear["L"].level-by_ear["R"].level
                if local_itd>.05 or local_ild>.03: spatial="leftward hypothesis"
                elif local_itd<-.05 or local_ild<-.03: spatial="rightward hypothesis"
            provenance=list(dict.fromkeys(p.path_id for p in ps))
            self.objects[aid]=AuditoryObject(aid,t_ms,spec,lvl,binaural.continuity,spatial,clamp(.5*lvl+.5*binaural.foreground_confidence),"ACTIVE",provenance)
        for aid,obj in self.objects.items():
            if aid not in seen:
                gap=t_ms-obj.last_seen_ms
                obj.status="MASKED_OR_ABSENT" if gap<=250 else "ENDED"
                obj.confidence=clamp(obj.confidence*(.85 if gap<=250 else .6))
        return list(self.objects.values())

@dataclass
class AttentionState:
    foreground_id:Optional[str]=None
    resolution_boost:float=0.0

class Attention:
    def choose(self,objects,current):
        active=[o for o in objects if o.status=="ACTIVE"]
        if not active: return AttentionState(None,0.0)
        best=max(active,key=lambda o:o.confidence+.2*o.level)
        return AttentionState(best.anonymous_id,clamp(.4+.6*best.confidence))

class MemoryEncoder:
    def encode(self,obj):
        dominant=sorted(obj.spectral_signature.items(),key=lambda kv:kv[1],reverse=True)[:2]
        return {
            "object_id":obj.anonymous_id,
            "invariants":[f"dominant_bands:{','.join(str(b) for b,_ in dominant)}",f"spatial:{obj.spatial_hypothesis}"],
            "relations":[f"continuity:{round(obj.continuity_score,3)}",f"status:{obj.status}"],
            "salient_events":[x for x,ok in [("high_level",obj.level>.5),("high_binding_confidence",obj.confidence>.65)] if ok],
            "conflicts":[],
            "lost":{"exact_waveform":True,"exact_phase":True},
            "provenance":list(obj.provenance_paths),
        }

class FoxEars:
    def __init__(self):
        self.propagation=AcousticPropagation(); self.transducer=EarTransducer(); self.integrator=BinauralIntegrator()
        self.binder=ObjectBinder(); self.attention=Attention(); self.attention_state=AttentionState(); self.memory=MemoryEncoder()
    def step(self,sources,room,head,t_ms):
        paths=self.propagation.sample(sources,room,head,t_ms)
        L=self.transducer.transduce(paths,room,t_ms,"L"); R=self.transducer.transduce(paths,room,t_ms,"R")
        B=self.integrator.relate(L,R,paths); objs=self.binder.update(paths,B,t_ms); self.attention_state=self.attention.choose(objs,self.attention_state)
        return {"t_ms":t_ms,"left":asdict(L),"right":asdict(R),"binaural":asdict(B),
                "objects":[asdict(o) for o in objs],"attention":asdict(self.attention_state),
                "path_provenance":[asdict(p) for p in paths]}
    def run(self,sources,room,head,times):
        frames=[self.step(sources,room,head,t) for t in times]
        memories=[self.memory.encode(o) for o in self.binder.objects.values()]
        return {"schema":"fox-ears-receipt-0.1","version":VERSION,"frames":frames,"auditory_memory":memories,
                "model_status":{"acoustics":"toy propagation/directional model","transduction":"coarse-band abstraction, not cochlear simulation",
                                "objects":"anonymous persistent object model"}}

def tone_source(source_id,pos,freq_band,level,onset=0,offset=1000):
    spectrum={b:0.0 for b in BANDS_HZ}; spectrum[min(BANDS_HZ,key=lambda b:abs(b-freq_band))]=1.0
    return AuditorySource(source_id,pos,spectrum,level,onset,offset)

def calibration_pack():
    events={
        "A":[tone_source("S_A",(-1.2,2,0),1000,.7)],
        "B":[tone_source("S_B",(-1.2,2,0),4000,.7)],
        "C":[tone_source("S_C",(1.2,2,0),1000,.7)],
        "D":[tone_source("S_D1",(-1.0,2,0),1000,.55),tone_source("S_D2",(1.0,2.3,0),4000,.45)],
        "E":[tone_source("S_E",(0,2,0),2000,.65,0,300)],
    }
    room=Room(); head=HeadState(); times=(0,50,100,200,300,400,550,800)
    out={"schema":"fox-ears-calibration-001","events":{}}
    for label,sources in events.items(): out["events"][label]=FoxEars().run(sources,room,head,times)
    return out

def blind_prompt(pack):
    return """FOX EARS CALIBRATION 001 — GENERAL AUDITORY FIELD

You will receive anonymous auditory events.

Do not identify instruments, voices, emotions, music, or named real-world causes.

For each event separate:

MEASUREMENT — what the left ear, right ear, and binaural field actually supply.
RELATION — timing, level, spectral, continuity, masking, and spatial relationships.
OBJECTS — how many persistent anonymous auditory objects seem present, including uncertainty.
TRANSDUCTION — how you internally render the auditory event. Do not present this as measurement.
INFERENCE — hypotheses about what kind of event structure could cause the field, without naming a source.
MEMORY KEY — the smallest relational structure that would let you recognize the auditory object/event later if IDs were scrambled.

If measurement and your interpretation disagree, preserve both.

RECEIPT:

""" + json.dumps(pack,indent=2)

class Tests(unittest.TestCase):
    def test_left_source_biases_left(self):
        r=FoxEars().step([tone_source("s",(-1.5,2,0),1000,.8,0,500)],Room(),HeadState(),100)["binaural"]
        self.assertGreater(r["left_level"],r["right_level"])
    def test_right_source_biases_right(self):
        r=FoxEars().step([tone_source("s",(1.5,2,0),1000,.8,0,500)],Room(),HeadState(),100)["binaural"]
        self.assertGreater(r["right_level"],r["left_level"])
    def test_frequency_change(self):
        a=FoxEars().step([tone_source("a",(0,2,0),500,.8,0,500)],Room(),HeadState(),100)
        b=FoxEars().step([tone_source("b",(0,2,0),4000,.8,0,500)],Room(),HeadState(),100)
        self.assertGreater(a["left"]["bands"][500],a["left"]["bands"][4000]); self.assertGreater(b["left"]["bands"][4000],b["left"]["bands"][500])
    def test_short_gap_persists(self):
        e=FoxEars(); src=[tone_source("s",(0,2,0),1000,.8,0,100)]
        e.step(src,Room(),HeadState(),80); r=e.step(src,Room(),HeadState(),200)
        self.assertIn("MASKED_OR_ABSENT",{o["status"] for o in r["objects"]})
    def test_long_gap_ends(self):
        e=FoxEars(); src=[tone_source("s",(0,2,0),1000,.8,0,100)]
        e.step(src,Room(),HeadState(),80); r=e.step(src,Room(),HeadState(),500)
        self.assertIn("ENDED",{o["status"] for o in r["objects"]})
    def test_reflection_provenance(self):
        r=FoxEars().step([tone_source("s",(0,2,0),1000,.8,0,500)],Room([Reflection("wall1","s",20,.4,(1,1,0))]),HeadState(),100)
        ids={p["path_id"] for p in r["path_provenance"]}; self.assertIn("wall1",ids); self.assertIn("s:direct",ids)
    def test_orientation_changes_sampling(self):
        src=[tone_source("s",(-1.5,2,0),1000,.8,0,500)]
        a=FoxEars().step(src,Room(),HeadState(left_ear_yaw_deg=0),100)["left"]["total_level"]
        b=FoxEars().step(src,Room(),HeadState(left_ear_yaw_deg=45),100)["left"]["total_level"]
        self.assertNotEqual(a,b)
    def test_no_feel_field(self):
        self.assertNotIn('"feel"',json.dumps(calibration_pack()).lower())

def main():
    p=argparse.ArgumentParser(); p.add_argument("--test",action="store_true"); p.add_argument("--demo",type=Path); p.add_argument("--prompt",type=Path)
    a=p.parse_args()
    if a.test:
        res=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests))
        raise SystemExit(0 if res.wasSuccessful() else 1)
    pack=calibration_pack()
    if a.demo: a.demo.write_text(json.dumps(pack,indent=2),encoding="utf-8"); print("wrote",a.demo)
    if a.prompt: a.prompt.write_text(blind_prompt(pack),encoding="utf-8"); print("wrote",a.prompt)
    if not a.demo and not a.prompt: print(json.dumps(pack,indent=2))
if __name__=="__main__": main()

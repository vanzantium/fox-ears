"""Independent reference (librosa) for tempo + key, to cross-check Fox Ears.
Not ground truth — Taylor's own BPM/key is the real answer key."""
import sys, json, glob, numpy as np, librosa
MAJ=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]);MIN=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
PC="C C# D D# E F F# G G# A A# B".split()
out=[]
for f in sorted(glob.glob("audio/*")):
    y,sr=librosa.load(f,sr=22050,mono=True)
    oenv=librosa.onset.onset_strength(y=y,sr=sr)
    tempo=float(np.atleast_1d(librosa.feature.tempo(onset_envelope=oenv,sr=sr))[0])
    chroma=librosa.feature.chroma_cqt(y=y,sr=sr).mean(axis=1)
    best=max(((np.corrcoef(np.roll(p,k),chroma)[0,1],f"{PC[k]} {m}") for p,m in ((MAJ,"major"),(MIN,"minor")) for k in range(12)))
    out.append({"file":f.split('/')[-1],"librosa_bpm":round(tempo,1),"ks_key":best[1],"ks_r":round(float(best[0]),2)})
    print(out[-1],flush=True)
json.dump(out,open("reference-librosa-2026-11-14.json","w"),indent=2)

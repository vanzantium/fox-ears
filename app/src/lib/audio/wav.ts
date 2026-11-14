export function encodeWavStereo(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): Blob {
  const n = Math.min(left.length, right.length);
  const bytesPerSample = 2;
  const blockAlign = 4;
  const dataSize = n * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < n; i++) {
    view.setInt16(offset, floatTo16(left[i] ?? 0), true);
    view.setInt16(offset + 2, floatTo16(right[i] ?? 0), true);
    offset += 4;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeStr(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

function floatTo16(v: number) {
  const x = Math.max(-1, Math.min(1, v));
  return x < 0 ? x * 0x8000 : x * 0x7fff;
}

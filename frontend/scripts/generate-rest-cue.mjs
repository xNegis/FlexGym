import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sampleRate = 44_100;
const firstToneHz = 523.25;
const secondToneHz = 392;
const toneDuration = 0.38;
const overlap = 0.1;
const secondStart = toneDuration - overlap;
const totalDuration = secondStart + toneDuration;
const sampleCount = Math.ceil(totalDuration * sampleRate);
const dataSize = sampleCount * 2;
const wav = Buffer.alloc(44 + dataSize);

wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataSize, 40);

function envelope(time) {
  const attack = 0.03;
  const release = 0.1;
  if (time < 0 || time >= toneDuration) return 0;
  if (time < attack) return time / attack;
  if (time > toneDuration - release) return (toneDuration - time) / release;
  return 1;
}

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const first =
    Math.sin(2 * Math.PI * firstToneHz * time) * envelope(time) * 0.16;
  const secondTime = time - secondStart;
  const second =
    Math.sin(2 * Math.PI * secondToneHz * secondTime) * envelope(secondTime) * 0.16;
  const value = Math.max(-1, Math.min(1, first + second));
  wav.writeInt16LE(Math.round(value * 32_767), 44 + index * 2);
}

const output = fileURLToPath(new URL("../ios/App/App/rest-complete.wav", import.meta.url));
writeFileSync(output, wav);

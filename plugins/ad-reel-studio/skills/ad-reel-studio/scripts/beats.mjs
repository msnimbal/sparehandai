#!/usr/bin/env node
/**
 * Find the phrases in a voiceover take, and optionally open air after some of
 * them. Writes the (retimed) take as WAV and beats.json, which reel.json's
 * "phrase:N" references resolve against.
 *
 *   node beats.mjs --vo ./audio/take.mp3 --out ./audio            # list phrases
 *   node beats.mjs --vo ./audio/take.mp3 --out ./audio --air 2:0.4,3:0.4,4:0.4
 *
 * Run it once without --air, read the phrase list against the script, then
 * decide where shots need room. --noise and --min tune the detector for a
 * breathy read (lower --noise) or a clipped one (lower --min).
 */
import { spawnSync } from "child_process";
import { resolve, join } from "path";
import { mkdirSync } from "fs";
import { arg, die, ff, ffmpegAvailable, probe, writeJSON } from "./lib/util.mjs";
import { parseSilences, phrasesFromSilences, retimePlan, parseAir } from "./lib/beats.mjs";

function silences(file, noise, min) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", `silencedetect=noise=${noise}dB:d=${min}`, "-f", "null", "-"], { encoding: "utf8" });
  if (r.status !== 0) die(`silencedetect failed on ${file}:\n${r.stderr.slice(-800)}`);
  return parseSilences(r.stderr);
}

const vo = arg("vo");
if (!vo) die("Usage: node beats.mjs --vo take.mp3 --out ./audio [--air 2:0.4,3:0.4] [--noise -38] [--min 0.12]");
if (!ffmpegAvailable()) die("ffmpeg is not on PATH. macOS: brew install ffmpeg · Debian/Ubuntu: sudo apt install ffmpeg · Windows: winget install ffmpeg");
const outDir = resolve(arg("out", "."));
mkdirSync(outDir, { recursive: true });
const noise = +arg("noise", -38), min = +arg("min", 0.12);

const duration = +probe(vo, "format=duration")[0];
if (!duration) die(`Could not read a duration from ${vo}`);
const phrases = phrasesFromSilences(silences(vo, noise, min), duration);
const air = parseAir(arg("air"));
const plan = retimePlan(phrases, duration, air);

// Rebuild the take from its own pieces, with silence where air was asked for.
const parts = [], labels = [];
plan.pieces.forEach((p, i) => {
  if (p.silence) parts.push(`aevalsrc=0:d=${p.silence}:s=44100:c=mono,aformat=channel_layouts=mono[p${i}]`);
  else parts.push(`[0:a]atrim=${p.from}:${p.to},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=mono[p${i}]`);
  labels.push(`[p${i}]`);
});
const wav = join(outDir, "vo.wav");
ff(["-i", vo, "-filter_complex", `${parts.join(";")};${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`, "-map", "[out]", wav], "retime");

writeJSON(join(outDir, "beats.json"), {
  source: resolve(vo), vo: wav, air, detector: { noise, min },
  duration: plan.duration, originalDuration: +duration.toFixed(3), phrases: plan.phrases,
});

console.log(`${phrases.length} phrases, ${duration.toFixed(2)}s${Object.keys(air).length ? ` -> ${plan.duration.toFixed(2)}s with air` : ""}`);
for (const p of plan.phrases) {
  const gap = air[p.n] ? `   +${air[p.n]}s air after` : "";
  console.log(`  phrase:${String(p.n).padEnd(3)} ${p.start.toFixed(2).padStart(6)} - ${p.end.toFixed(2).padStart(6)}  (${(p.end - p.start).toFixed(2)}s)${gap}`);
}
console.log(`\nwrote ${wav}\nwrote ${join(outDir, "beats.json")}`);

#!/usr/bin/env node
/**
 * The voice-led cut: shots timed to the voiceover, ad-creative's copy layers
 * composited unchanged over each, caption panels behind the copy, the voice
 * and a ducked music bed underneath.
 *
 *   node cut.mjs --reel ./reel.json --propose     # one proof frame per shot + a contact sheet
 *   node cut.mjs --reel ./reel.json               # the MP4s, once reel.json says "approved": true
 *
 * Why this is not ad-motionify's assembler: that one gives every slide the same
 * length, which is right for a silent slide reel and wrong the moment a voice is
 * the clock. Here each shot starts on a phrase, so shot lengths are whatever the
 * read makes them.
 *
 * The copy is never re-rendered. It arrives as ad-creative's transparent layers
 * and is composited as-is, so the date, the CTA and the legal line are exactly
 * the pixels that skill verified.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, join, basename } from "path";
import { arg, flag, die, ff, ffmpegAvailable, readJSON, writeJSON, hexToRgb } from "./lib/util.mjs";
import { plan } from "./lib/timeline.mjs";
import { decodePNG, encodePNG } from "./lib/png.mjs";
import { bandsFromAlpha, panelRGBA, tileMaskRGBA } from "./lib/panels.mjs";

const reelPath = arg("reel");
if (!reelPath) die("Usage: node cut.mjs --reel ./reel.json [--propose]");
if (!ffmpegAvailable()) die("ffmpeg is not on PATH. macOS: brew install ffmpeg · Debian/Ubuntu: sudo apt install ffmpeg · Windows: winget install ffmpeg");
const base = dirname(resolve(reelPath));
const at = (p) => resolve(base, p);
const reel = readJSON(reelPath);
const PROPOSE = flag("propose");

const layers = readJSON(join(at(reel.layers ?? "./layers"), "layers.json"));
const layerDir = at(reel.layers ?? "./layers");
const W = layers.layers[0].width, H = layers.layers[0].height, FPS = reel.fps ?? 30;
const ground = reel.panels?.colour ?? layers.ground ?? "#FFFFFF";
const beats = reel.beats ? readJSON(at(reel.beats)) : null;
const vo = reel.vo ? at(reel.vo) : beats?.vo ?? null;

const t = plan(reel, beats);
for (const p of t.problems) console.warn(`warning: ${p}`);

const work = at(reel.work ?? "./.reel-work");
mkdirSync(work, { recursive: true });

/* ----------------------------------------------------- per-shot assets ---- */
const layerFile = (n) => {
  const l = layers.layers[n - 1];
  if (!l) die(`Shot names layer ${n}, but layers.json has ${layers.layers.length}. Re-export with export-layers.mjs after changing the slides.`);
  return join(layerDir, l.file);
};

/** A caption panel sized from the layer's own alpha. Cached by layer file. */
function panelFor(n) {
  const out = join(work, `panel-${n}.png`);
  const src = layerFile(n);
  const { width, height, rgba } = decodePNG(readFileSync(src));
  const bands = bandsFromAlpha(rgba, width, height);
  writeFileSync(out, encodePNG(width, height, panelRGBA(width, height, bands, {
    colour: hexToRgb(ground), alpha: reel.panels?.alpha ?? 0.93,
  })));
  return out;
}

/** Where a grid fits: below the lowest copy block above centre, above the footer. */
function gridBox(n) {
  const b = layers.layers[n - 1].boxes;
  const upper = ["head", "sub", "cta"].map((k) => b[k]).filter((x) => x && x.top < H / 2).map((x) => x.bottom);
  const top = Math.round((upper.length ? Math.max(...upper) : H * 0.2) + 46);
  const bottom = Math.round((b.foot?.top ?? H * 0.82) - 34);
  const gap = 20, size = Math.floor(Math.min((W * 0.78 - gap) / 2, (bottom - top - gap) / 2));
  const x0 = Math.round((W - (size * 2 + gap)) / 2), y0 = Math.round(top + (bottom - top - (size * 2 + gap)) / 2);
  return { size, gap, pos: [[x0, y0], [x0 + size + gap, y0], [x0, y0 + size + gap], [x0 + size + gap, y0 + size + gap]] };
}

/* ------------------------------------------------------- filter graph ---- */
const inputs = [], graph = [];
const input = (args) => { inputs.push(...args); return inputs.filter((a) => a === "-i").length - 1; };
const still = (file, dur) => input(["-loop", "1", "-t", String(dur), "-i", file]);

/** A moving source, filled to the frame. Clips shorter than the shot hold their last frame. */
function source(src, from, speed, dur, label) {
  const f = at(src);
  if (!existsSync(f)) die(`Missing source: ${src}`);
  const isStill = /\.(png|jpe?g|webp)$/i.test(f);
  const k = isStill ? still(f, dur) : input(["-i", f]);
  const pre = isStill ? "" : `trim=start=${from ?? 0},setpts=(PTS-STARTPTS)/${speed ?? 1},`;
  graph.push(`[${k}:v]${pre}fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},` +
    `tpad=stop_mode=clone:stop_duration=${dur},trim=duration=${dur},setpts=PTS-STARTPTS,format=yuv420p[${label}]`);
}

t.shots.forEach((s, i) => {
  const dur = s.duration, L = still(layerFile(s.layer), dur);
  if (s.grid) {
    const g = gridBox(s.layer), mask = join(work, `tile-mask-${g.size}.png`);
    writeFileSync(mask, encodePNG(g.size, g.size, tileMaskRGBA(g.size)));
    graph.push(`color=c=${ground.replace("#", "0x")}:s=${W}x${H}:r=${FPS}:d=${dur}[g${i}_0]`);
    s.grid.slice(0, 4).forEach((tile, k) => {
      source(tile.src, tile.from ?? 0.3, tile.speed ?? 0.9, dur, `g${i}t${k}`);
      const [fx, fy] = tile.focus ?? [W / 2, H / 2], c = Math.round(tile.crop ?? W * 0.76);
      const cx = Math.round(Math.min(Math.max(fx - c / 2, 0), W - c)), cy = Math.round(Math.min(Math.max(fy - c / 2, 0), H - c));
      const M = still(mask, dur);
      graph.push(`[${M}:v]format=gray,fps=${FPS}[g${i}m${k}]`);
      graph.push(`[g${i}t${k}]crop=${c}:${c}:${cx}:${cy},scale=${g.size}:${g.size},format=yuva420p[g${i}s${k}];[g${i}s${k}][g${i}m${k}]alphamerge[g${i}a${k}]`);
      graph.push(`[g${i}_${k}][g${i}a${k}]overlay=${g.pos[k][0]}:${g.pos[k][1]}${k === 0 ? ":shortest=1" : ""}[g${i}_${k + 1}]`);
    });
    graph.push(`[g${i}_${Math.min(4, s.grid.length)}][${L}:v]overlay=0:0,format=yuv420p[s${i}]`);
  } else if (s.card) {
    graph.push(`color=c=${ground.replace("#", "0x")}:s=${W}x${H}:r=${FPS}:d=${dur}[c${i}];[c${i}][${L}:v]overlay=0:0,format=yuv420p[s${i}]`);
  } else {
    source(s.src, s.from, s.speed, dur, `b${i}`);
    if (s.panel === false || reel.panels === false) {
      graph.push(`[b${i}][${L}:v]overlay=0:0,format=yuv420p[s${i}]`);
    } else {
      const P = still(panelFor(s.layer), dur);
      graph.push(`[b${i}][${P}:v]overlay=0:0[p${i}];[p${i}][${L}:v]overlay=0:0,format=yuv420p[s${i}]`);
    }
  }
});

const outDir = at(reel.out ?? "./out");
mkdirSync(outDir, { recursive: true });

/* ------------------------------------------------------------ propose ---- */
if (PROPOSE) {
  const dir = at(reel.proposal ?? "./proposal");
  mkdirSync(dir, { recursive: true });
  const frames = t.shots.map((s, i) => {
    const out = join(dir, `shot-${i + 1}.png`);
    const unused = t.shots.map((_, k) => k).filter((k) => k !== i).map((k) => `[s${k}]nullsink`);
    ff([...inputs, "-filter_complex", [...graph, ...unused, `[s${i}]trim=start=${(s.duration / 2).toFixed(2)},setpts=PTS-STARTPTS[o]`].join(";"),
      "-map", "[o]", "-frames:v", "1", out], `proof frame ${i + 1}`);
    return out;
  });
  const cols = Math.min(4, frames.length), tw = 270, th = Math.round((tw * H) / W);
  const sheet = join(dir, "contact-sheet.png");
  ff([...frames.flatMap((f) => ["-i", f]), "-filter_complex",
    frames.map((_, i) => `[${i}]scale=${tw}:${th}[f${i}]`).join(";") + ";" +
      `${frames.map((_, i) => `[f${i}]`).join("")}xstack=inputs=${frames.length}:fill=white:layout=` +
      frames.map((_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * th}`).join("|"),
    "-frames:v", "1", sheet], "contact sheet");
  console.log(`\n${t.shots.length} shots over ${t.seconds}s`);
  for (const s of t.shots) console.log(`  shot ${String(s.index + 1).padEnd(2)} cut ${s.cut.toFixed(2).padStart(6)}s  runs ${(s.duration).toFixed(2)}s  ${s.transitionIn?.type ?? "(opens)"}`);
  console.log(`\nproof frames: ${dir}\ncontact sheet: ${sheet}\n\nLook at every frame, then set "approved": true in reel.json and run without --propose.`);
  process.exit(0);
}

if (!reel.approved) die('reel.json is not approved. Run with --propose, look at the frames, then set "approved": true.');

/* ---------------------------------------------------------- assemble ---- */
let prev = "s0";
t.shots.slice(1).forEach((s) => {
  graph.push(`[${prev}][s${s.index}]xfade=transition=${s.transitionIn.type}:duration=${s.transitionIn.duration}:offset=${s.transitionIn.offset}[x${s.index}]`);
  prev = `x${s.index}`;
});

const T = t.seconds, ms = Math.round(t.voDelay * 1000);
let audioOut = null;
if (vo) {
  const v = input(["-i", vo]);
  graph.push(`[${v}:a]aresample=48000,adelay=${ms}|${ms},loudnorm=I=${reel.voLufs ?? -16}:TP=-1.5:LRA=11,apad,atrim=0:${T}[voice]`);
  audioOut = "voice";
}
const music = reel.music ? (typeof reel.music === "string" ? { file: reel.music } : reel.music) : null;
if (music) {
  const m = input(["-stream_loop", "-1", "-i", at(music.file)]);
  graph.push(`[${m}:a]aresample=48000,atrim=0:${T},asetpts=PTS-STARTPTS,loudnorm=I=${music.lufs ?? -24}:TP=-3,afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, T - 1.2)}:d=1.2[bed]`);
  if (audioOut) {
    // the bed ducks under the voice rather than sitting at a fixed level beneath it
    graph.push(`[voice]asplit[v1][v2];[bed][v2]sidechaincompress=threshold=0.04:ratio=6:attack=15:release=350[duck];[v1][duck]amix=inputs=2:normalize=0,alimiter=limit=0.89[mix]`);
    audioOut = "mix";
  } else audioOut = "bed";
}

const name = `${reel.name ?? basename(base)}-${layers.layers[0].label?.split(" / ")[1] ?? `${W}x${H}`}-${T.toFixed(1)}s`;
const mp4 = join(outDir, `${name}.mp4`), silent = join(outDir, `${name}-silent.mp4`);
ff([...inputs, "-filter_complex", graph.join(";"), "-map", `[${prev}]`, ...(audioOut ? ["-map", `[${audioOut}]`, "-c:a", "aac", "-b:a", "192k"] : []),
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", "-t", String(T), mp4], "assemble");
// A silent copy, stream-copied, so the music can be swapped in an editor without re-encoding picture.
if (audioOut) ff(["-i", mp4, "-an", "-c:v", "copy", silent], "silent copy");

writeJSON(join(outDir, `${name}.timeline.json`), { seconds: T, shots: t.shots, vo, music: music?.file ?? null, problems: t.problems });
console.log(`wrote ${mp4}${audioOut ? `\nwrote ${silent}` : ""}`);

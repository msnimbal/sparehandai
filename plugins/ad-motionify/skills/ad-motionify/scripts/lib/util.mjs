/**
 * Shared plumbing. Deliberately dependency-free: this skill shells out to
 * ffmpeg and moves JSON and PNGs around, so adding an npm tree would buy
 * nothing and make the install another thing that can fail.
 */
import { execFileSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}

export function flag(name) {
  return process.argv.includes(`--${name}`);
}

export function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

export function readJSON(p) {
  return JSON.parse(readFileSync(resolve(p), "utf8"));
}

export function writeJSON(p, data) {
  mkdirSync(dirname(resolve(p)), { recursive: true });
  writeFileSync(resolve(p), JSON.stringify(data, null, 2));
  return resolve(p);
}

export function ffmpegAvailable() {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

/** Run ffmpeg. Errors carry ffmpeg's own stderr, which is where the real cause is. */
export function ff(args, label = "ffmpeg") {
  try {
    execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const err = e.stderr?.toString().trim() || e.message;
    throw new Error(`${label} failed:\n${err}`);
  }
}

/** ffprobe one or more entries; returns an array of the printed values. */
export function probe(file, entries) {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", entries, "-of", "default=nw=1:nk=1", String(file)],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    return out.toString().trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function hexToRgb(hex) {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) throw new Error(`Not a hex colour: ${hex}`);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Relative luminance, for deciding whether copy needs a light or dark scrim. */
export function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

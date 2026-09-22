#!/usr/bin/env node
/**
 * A bed that sits under the picture, synthesised locally.
 *
 *   node audio.mjs --seconds 20 --out ./bed.wav [--key Am] [--lufs -23]
 *
 * Two things here were learned the hard way and are the reason this is not
 * three lines of `sine`.
 *
 * **Held tones are not music.** A chord of sustained sines - root, fifth,
 * octave - is the acoustic recipe for a gong, and pure sines have no harmonics
 * to read as an instrument. What makes a bed sound like a bed is notes that
 * attack and decay, with silence between them, and harmonics so each note has
 * a timbre. A first attempt held four sines for the whole clip and measured 2.0
 * LU of range: nothing changed for twenty seconds, and it sounded like it.
 *
 * **A bed belongs at about -23 LUFS.** Normalising it to -16, the figure for
 * voice-forward content, lifts a static tone by 12dB and makes it the loudest
 * thing in the ad. Loudness is the last thing anyone checks and the first thing
 * an audience notices.
 */
import { spawnSync } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { arg, die, ff, probe } from "./lib/util.mjs";

/** Low pentatonic sets. Sparse and modal, so nothing implies a chord progression. */
export const KEYS = {
  Am: [110.0, 164.81, 130.81, 196.0, 110.0, 164.81],
  Cm: [130.81, 196.0, 155.56, 233.08, 130.81, 196.0],
  Dm: [146.83, 220.0, 174.61, 261.63, 146.83, 220.0],
};

const DECAY = 4.2;
/** Fundamental plus two harmonics: the difference between a note and a test tone. */
const HARMONICS = [[1, 1.0], [2, 0.28], [3, 0.1]];
const POSITIONS = [0, 0.17, 0.33, 0.52, 0.68, 0.84];

export function bed({ seconds, out, key = "Am", gain = 3.4 }) {
  const notes = KEYS[key] || KEYS.Am;
  const inputs = [];
  const chains = [];
  const mixes = [];
  let i = 0;

  for (const [n, pos] of POSITIONS.entries()) {
    const start = pos * seconds;
    const dur = Math.min(DECAY, Math.max(0.8, seconds - start));
    if (dur < 0.4) continue;
    for (const [mult, amp] of HARMONICS) {
      inputs.push("-f", "lavfi", "-i", `sine=f=${(notes[n % notes.length] * mult).toFixed(2)}:d=${dur.toFixed(2)}`);
      chains.push(
        `[${i}]afade=t=in:st=0:d=0.012,` +
          `afade=t=out:st=0.25:d=${(dur - 0.25).toFixed(2)}:curve=exp,` +
          `volume=${(amp * 0.3).toFixed(4)},` +
          `adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}[n${i}]`,
      );
      mixes.push(`[n${i}]`);
      i++;
    }
  }

  // Air under the notes. Brown noise, heavily filtered, breathing slowly — it
  // stops the gaps between notes sounding like dropouts.
  inputs.push("-f", "lavfi", "-i", `anoisesrc=color=brown:d=${seconds}:a=0.35`);
  chains.push(`[${i}]lowpass=f=340,highpass=f=60,volume=0.10,tremolo=f=0.12:d=0.6[n${i}]`);
  mixes.push(`[n${i}]`);
  i++;

  const filter =
    chains.join(";") + ";" + mixes.join("") +
    `amix=inputs=${i}:normalize=0:dropout_transition=0,` +
    `aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo,` +
    `atrim=0:${seconds},afade=t=in:st=0:d=0.6,` +
    `afade=t=out:st=${Math.max(0, seconds - 2.5).toFixed(2)}:d=2.5,` +
    `volume=${gain},alimiter=limit=0.9[a]`;

  ff([...inputs, "-filter_complex", filter, "-map", "[a]",
    "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", String(out)], "bed");
  return String(out);
}

/**
 * Mux a track under a finished cut.
 *
 * `-stream_loop` tiles a track shorter than the video. Pair it with a
 * boomeranged source and the loop point is inaudible; without that, a short bed
 * clicks every time it wraps.
 */
export function mux({ video, audio, out, seconds, lufs = -23 }) {
  ff([
    "-i", String(video), "-stream_loop", "-1", "-i", String(audio),
    "-filter_complex",
    `[1:a]atrim=0:${seconds},asetpts=N/SR/TB,loudnorm=I=${lufs}:TP=-2:LRA=11,` +
      `afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, seconds - 0.8).toFixed(2)}:d=0.8[a]`,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-ar", "48000", "-shortest", "-movflags", "+faststart", String(out),
  ], "mux");
  return String(out);
}

/** Integrated loudness of a finished file, for saying what was actually produced. */
export function loudness(file) {
  // ebur128 prints its summary on stderr and ffmpeg still exits 0, so reading
  // stdout (or only reading on throw) finds nothing. spawnSync hands back both
  // streams whatever the exit code.
  const r = spawnSync("ffmpeg",
    ["-hide_banner", "-nostats", "-i", String(file), "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 24 });
  const m = `${r.stderr || ""}${r.stdout || ""}`.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  return m ? Number(m[1]) : null;
}

/* ---------------------------------------------------------------- CLI ---- */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const seconds = Number(arg("seconds", 0));
  if (!seconds) die(`Usage: node audio.mjs --seconds 20 [--key ${Object.keys(KEYS).join("|")}] [--out ./bed.wav]`);
  const out = bed({ seconds, out: arg("out", `./bed-${seconds}s.wav`), key: arg("key", "Am") });
  console.log(`${out}  ${probe(out, "format=duration")[0]}s`);
}

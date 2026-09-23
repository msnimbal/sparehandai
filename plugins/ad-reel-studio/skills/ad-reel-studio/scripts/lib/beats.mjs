/**
 * The voiceover is the clock. Everything here is pure: silences in, phrases
 * and a retime plan out, so the timing can be tested without an audio file.
 *
 * Why retime rather than regenerate: a voice model reads a list of short items
 * ("Dentist? Accountant? Hairdresser?") at about 0.7s each. That is natural
 * speech and far too fast to cut picture to — a transition alone takes 0.4s.
 * Regenerating with ellipses changes the whole read and costs another take.
 * Cutting the take at its own pauses and opening a little air after chosen
 * phrases keeps the performance and gives each shot room to land.
 */

/** Parse ffmpeg silencedetect stderr into [{start, end}]. */
export function parseSilences(stderr) {
  const out = [];
  let start = null;
  for (const line of String(stderr).split("\n")) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) start = +s[1];
    if (e && start !== null) { out.push({ start, end: +e[1] }); start = null; }
  }
  if (start !== null) out.push({ start, end: Infinity });
  return out;
}

/** Speech between silences. Fragments shorter than minPhrase are breaths, not words. */
export function phrasesFromSilences(silences, duration, { minPhrase = 0.12 } = {}) {
  const phrases = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start - cursor >= minPhrase) phrases.push({ start: cursor, end: s.start });
    cursor = Math.min(s.end, duration);
  }
  if (duration - cursor >= minPhrase) phrases.push({ start: cursor, end: duration });
  return phrases.map((p, i) => ({ n: i + 1, start: +p.start.toFixed(3), end: +p.end.toFixed(3) }));
}

/**
 * Plan a retime. `air` maps a 1-based phrase number to seconds of silence to
 * add after it. Splits fall in the middle of the existing pause, so no word
 * is ever clipped.
 * Returns { pieces: [{from,to}|{silence}], phrases (new times), duration }.
 */
export function retimePlan(phrases, duration, air = {}) {
  const pieces = [], shifted = [];
  let from = 0, added = 0;
  phrases.forEach((p, i) => {
    shifted.push({ n: p.n, start: +(p.start + added).toFixed(3), end: +(p.end + added).toFixed(3) });
    const extra = +(air[p.n] ?? 0);
    if (extra > 0 && i < phrases.length - 1) {
      const split = (p.end + phrases[i + 1].start) / 2;
      pieces.push({ from, to: split }, { silence: extra });
      from = split;
      added += extra;
    }
  });
  pieces.push({ from, to: duration });
  return { pieces, phrases: shifted, duration: +(duration + added).toFixed(3) };
}

/** "1:0.4,2:0.4,4:0.25" or {"1":0.4} -> { 1: 0.4, ... } */
export function parseAir(spec) {
  if (!spec) return {};
  if (typeof spec === "object") return Object.fromEntries(Object.entries(spec).map(([k, v]) => [+k, +v]));
  return Object.fromEntries(String(spec).split(",").filter(Boolean).map((kv) => {
    const [k, v] = kv.split(":");
    if (!v || Number.isNaN(+k) || Number.isNaN(+v)) throw new Error(`Bad --air entry "${kv}": expected phrase:seconds, e.g. 2:0.4`);
    return [+k, +v];
  }));
}

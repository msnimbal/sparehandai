/**
 * reel.json + beats.json -> when each shot starts, how long it runs, and where
 * each transition sits. Pure, so the arithmetic that decides whether the cut
 * lands on the voice can be tested in milliseconds.
 *
 * The convention: a shot cuts in `lead` seconds before its phrase is spoken.
 * Picture slightly ahead of sound reads as intentional; picture behind sound
 * reads as a late edit. Each transition is centred on its cut, so shot i runs
 * from cut_i - D/2 to cut_{i+1} + D/2, and a chain of xfades with offset
 * cut_k - D/2 lands every cut exactly where it was planned.
 */

export const DEFAULTS = { lead: 0.25, voDelay: 0.15, tail: 0.7, transition: { type: "fade", duration: 0.4 } };

/** Resolve a shot's `at`: seconds, or "phrase:N" (1-based, as beats.json numbers them). */
export function resolveAt(at, phrases, { lead, voDelay }) {
  if (typeof at === "number") return at;
  const m = String(at ?? "").match(/^phrase:(\d+)$/);
  if (!m) throw new Error(`Shot "at" must be seconds or "phrase:N", got ${JSON.stringify(at)}`);
  const p = phrases.find((x) => x.n === +m[1]);
  if (!p) throw new Error(`"${at}" names a phrase that does not exist; beats.json has ${phrases.length}`);
  return Math.max(0, p.start + voDelay - lead);
}

export function plan(reel, beats) {
  const opt = { ...DEFAULTS, ...reel, transition: { ...DEFAULTS.transition, ...(reel.transition ?? {}) } };
  const phrases = beats?.phrases ?? [];
  const D = opt.transition.duration;
  if (!reel.shots?.length) throw new Error("reel.json has no shots");

  const cuts = reel.shots.map((s, i) => (i === 0 ? 0 : +resolveAt(s.at, phrases, opt).toFixed(3)));
  const voEnd = phrases.length ? phrases[phrases.length - 1].end + opt.voDelay : 0;
  const T = +(reel.seconds ?? Math.max(voEnd + opt.tail, cuts[cuts.length - 1] + D * 2)).toFixed(3);

  const problems = [];
  cuts.forEach((c, i) => {
    const next = i < cuts.length - 1 ? cuts[i + 1] : T;
    if (next - c < D * 1.5) {
      problems.push(`Shot ${i + 1} runs ${(next - c).toFixed(2)}s, under 1.5x the ${D}s transition; it will read as a flash. Add air after its phrase (beats.mjs --air) or merge shots.`);
    }
  });
  if (reel.seconds && voEnd > reel.seconds) problems.push(`The voice runs to ${voEnd.toFixed(2)}s but seconds is ${reel.seconds}; the last words would be cut off.`);

  const shots = reel.shots.map((s, i) => {
    const start = Math.max(0, cuts[i] - D / 2);
    const end = Math.min(T, (i < cuts.length - 1 ? cuts[i + 1] : T) + D / 2);
    return {
      ...s, index: i, cut: cuts[i],
      start: +start.toFixed(3), duration: +(end - start).toFixed(3),
      transitionIn: i === 0 ? null : { type: s.transition ?? opt.transition.type, duration: D, offset: +(cuts[i] - D / 2).toFixed(3) },
    };
  });
  return { seconds: T, voDelay: opt.voDelay, shots, problems };
}

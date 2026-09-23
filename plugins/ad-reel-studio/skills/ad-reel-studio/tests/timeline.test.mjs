/**
 * Timing, panels and PNG tests. No ffmpeg, no files.
 *
 *   node --test tests/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, resolveAt } from "../scripts/lib/timeline.mjs";
import { parseSilences, phrasesFromSilences, retimePlan, parseAir } from "../scripts/lib/beats.mjs";
import { bandsFromAlpha, panelRGBA, tileMaskRGBA } from "../scripts/lib/panels.mjs";
import { encodePNG, decodePNG } from "../scripts/lib/png.mjs";

// The Oct 31 workshop take, as silencedetect reported it.
const STDERR = `
[silencedetect] silence_start: 1.802358
[silencedetect] silence_end: 2.071542 | silence_duration: 0.27
[silencedetect] silence_start: 2.52941
[silencedetect] silence_end: 2.681519
[silencedetect] silence_start: 3.238005
[silencedetect] silence_end: 3.440975
[silencedetect] silence_start: 16.312494
[silencedetect] silence_end: 16.48`;

test("silences parse and become phrases", () => {
  const s = parseSilences(STDERR);
  assert.equal(s.length, 4);
  const p = phrasesFromSilences(s, 16.48);
  assert.deepEqual(p.map((x) => x.n), [1, 2, 3, 4]);
  assert.equal(p[1].start, 2.072);
  assert.equal(p[1].end, 2.529);
});

test("a trailing silence with no end does not invent a phrase", () => {
  const p = phrasesFromSilences(parseSilences("silence_start: 5.0"), 6);
  assert.equal(p.length, 1);
  assert.equal(p[0].end, 5);
});

test("retime adds air after chosen phrases and shifts everything after", () => {
  const p = phrasesFromSilences(parseSilences(STDERR), 16.48);
  const r = retimePlan(p, 16.48, { 2: 0.4, 3: 0.4 });
  assert.equal(r.duration, 17.28);
  assert.equal(r.phrases[1].start, p[1].start);           // phrase 2 itself does not move
  assert.equal(r.phrases[2].start, +(p[2].start + 0.4).toFixed(3));
  assert.equal(r.phrases[3].start, +(p[3].start + 0.8).toFixed(3));
  // splits fall inside pauses, never inside a word
  const split = r.pieces[0].to;
  assert.ok(split > p[1].end && split < p[2].start);
});

test("air after the last phrase is ignored rather than padding the end", () => {
  const p = phrasesFromSilences(parseSilences(STDERR), 16.48);
  assert.equal(retimePlan(p, 16.48, { 4: 1 }).duration, 16.48);
});

test("parseAir accepts both forms and rejects junk", () => {
  assert.deepEqual(parseAir("1:0.4,3:0.25"), { 1: 0.4, 3: 0.25 });
  assert.deepEqual(parseAir({ 2: "0.5" }), { 2: 0.5 });
  assert.throws(() => parseAir("2"), /phrase:seconds/);
});

const beats = { phrases: [
  { n: 1, start: 0, end: 1.8 }, { n: 2, start: 2.07, end: 2.53 }, { n: 3, start: 3.08, end: 3.64 },
  { n: 4, start: 4.24, end: 4.81 }, { n: 5, start: 5.43, end: 8 },
] };

test("cuts land lead seconds before their phrase, allowing for the VO delay", () => {
  assert.equal(resolveAt("phrase:3", beats.phrases, { lead: 0.25, voDelay: 0.15 }), 3.08 + 0.15 - 0.25);
  assert.equal(resolveAt(4.5, beats.phrases, { lead: 0.25, voDelay: 0.15 }), 4.5);
  assert.throws(() => resolveAt("phrase:9", beats.phrases, { lead: 0, voDelay: 0 }), /does not exist/);
  assert.throws(() => resolveAt("beat 2", beats.phrases, { lead: 0, voDelay: 0 }), /phrase:N/);
});

test("shot windows overlap by exactly one transition and fill the timeline", () => {
  const reel = { transition: { type: "smoothleft", duration: 0.4 }, shots: [
    { layer: 1 }, { layer: 2, at: "phrase:3" }, { layer: 3, at: "phrase:5", transition: "fade" },
  ] };
  const t = plan(reel, beats);
  assert.equal(t.seconds, +(8 + 0.15 + 0.7).toFixed(3));
  // chained xfade: output length after k transitions == start of shot k + its duration
  let len = t.shots[0].duration;
  for (const s of t.shots.slice(1)) {
    assert.equal(s.transitionIn.offset, s.start);            // offset sits D/2 before the cut
    len = s.transitionIn.offset + s.duration;
  }
  assert.ok(Math.abs(len - t.seconds) < 1e-6);
  assert.equal(t.shots[1].transitionIn.type, "smoothleft");
  assert.equal(t.shots[2].transitionIn.type, "fade");
});

test("a shot too short for its transition is reported, not silently flashed", () => {
  const reel = { shots: [{ layer: 1 }, { layer: 2, at: 2.0 }, { layer: 3, at: 2.3 }] };
  const t = plan(reel, beats);
  assert.ok(t.problems.some((p) => p.startsWith("Shot 2")));
});

test("a fixed length shorter than the voice is reported", () => {
  const t = plan({ seconds: 6, shots: [{ layer: 1 }] }, beats);
  assert.ok(t.problems.some((p) => /cut off/.test(p)));
});

test("bands join lines of one block and keep separate blocks apart", () => {
  const w = 20, h = 200, px = Buffer.alloc(w * h * 4);
  const ink = (y0, y1) => { for (let y = y0; y < y1; y++) for (let x = 5; x < 15; x++) px[(y * w + x) * 4 + 3] = 255; };
  ink(10, 20); ink(40, 50); ink(160, 170);
  const b = bandsFromAlpha(px, w, h, { gap: 30 });
  assert.equal(b.length, 2);
  assert.deepEqual([b[0].top, b[0].bottom, b[1].top], [10, 49, 160]);
});

test("panels are opaque inside, clear outside, and soft at the corners", () => {
  const w = 400, h = 200;
  const p = panelRGBA(w, h, [{ top: 60, bottom: 140, left: 100, right: 300 }], { alpha: 1, pad: 20, radius: 30, margin: 0 });
  const a = (x, y) => p[(y * w + x) * 4 + 3];
  assert.equal(a(200, 100), 255);
  assert.equal(a(10, 10), 0);
  assert.equal(a(68, 40), 0); // the very corner is outside the radius
  const m = tileMaskRGBA(50, 10);
  assert.equal(m[(25 * 50 + 25) * 4 + 3], 255);
  assert.equal(m[3], 0);
});

test("PNG round-trips through the encoder and decoder", () => {
  const w = 7, h = 5, px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < px.length; i++) px[i] = (i * 37) & 255;
  const back = decodePNG(encodePNG(w, h, px));
  assert.equal(back.width, w);
  assert.deepEqual(Buffer.compare(back.rgba, px), 0);
});

/**
 * Post-render checks run against the live page, before the screenshot is kept.
 *
 * The premise of rendering from code rather than an image model is that the
 * legal line is exactly right. That premise fails silently the moment a long
 * headline pushes the CTA down over the fine print: the text is still in the
 * DOM, the PNG still looks finished, and the compliance element is gone. So
 * overlap is a hard failure, not a warning — a missing disclosure is worse
 * than a missing file.
 *
 * Wrapping is different. A headline that breaks in an unintended place is a
 * quality loss, not a compliance one, and sometimes it is what the author
 * wanted. That warns.
 */

const OVERLAP_TOLERANCE_PX = 1;

function overlaps(a, b) {
  if (!a || !b) return false;
  return !(
    a.right <= b.left + OVERLAP_TOLERANCE_PX ||
    b.right <= a.left + OVERLAP_TOLERANCE_PX ||
    a.bottom <= b.top + OVERLAP_TOLERANCE_PX ||
    b.bottom <= a.top + OVERLAP_TOLERANCE_PX
  );
}

/** Boxes and wrap information for one rendered frame. */
export async function inspectFrame(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };

    // Which <br>-delimited headline segments wrapped. Each segment is wrapped
    // in a span, measured, then the original markup is restored, so this
    // leaves the frame exactly as it was for the screenshot.
    let wrappedSegments = [];
    const head = document.querySelector(".head");
    if (head) {
      const original = head.innerHTML;
      const segments = original.split(/<br\s*\/?>/i);
      if (segments.length) {
        head.innerHTML = segments.map((s) => `<span data-seg>${s}</span>`).join("<br>");
        wrappedSegments = [...head.querySelectorAll("[data-seg]")]
          .filter((sp) => sp.getClientRects().length > 1)
          .map((sp) => ({ text: sp.textContent.trim(), lines: sp.getClientRects().length }));
        head.innerHTML = original;
      }
    }

    return {
      cta: box(".cta"),
      foot: box(".foot"),
      fine: box(".fine"),
      head: box(".head"),
      sub: box(".sub"),
      frame: box(".frame"),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      wrappedSegments,
    };
  });
}

/**
 * Returns { errors, warnings } for a frame. `errors` mean the file must not be
 * treated as usable.
 */
export function checkFrame(info, label) {
  const errors = [];
  const warnings = [];
  const at = label ? `${label}: ` : "";

  // The collision that destroys a disclosure.
  for (const [name, b] of [["headline", info.head], ["subline", info.sub], ["CTA", info.cta]]) {
    if (overlaps(b, info.foot)) {
      errors.push(
        `${at}the ${name} overlaps the fine print, which hides the legal line. ` +
          `Shorten the headline, add <br> to control the break, or lower "scale".`,
      );
    }
  }

  // Content taller or wider than the canvas is cropped by overflow:hidden, so
  // whatever fell off is simply absent from the PNG with nothing to show for it.
  if (info.scrollHeight > info.viewport.height + 2) {
    errors.push(
      `${at}content is ${Math.round(info.scrollHeight - info.viewport.height)}px taller than the ` +
        `frame and is being cropped. Shorten the copy or reduce "scale".`,
    );
  }
  if (info.scrollWidth > info.viewport.width + 2) {
    errors.push(`${at}content is wider than the frame and is being cropped.`);
  }

  for (const seg of info.wrappedSegments) {
    warnings.push(
      `${at}headline segment "${seg.text}" wrapped to ${seg.lines} lines. ` +
        `Add <br> where you want the break, or shorten it.`,
    );
  }

  return { errors, warnings };
}

/** Collects problems across a run so one summary is printed at the end. */
export class FrameReport {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  add({ errors, warnings }) {
    this.errors.push(...errors);
    this.warnings.push(...warnings);
  }

  /** Prints what was found. Returns true when the run should be treated as failed. */
  finish({ failOnError = true } = {}) {
    for (const w of this.warnings) console.warn(`Warning: ${w}`);
    if (!this.errors.length) return false;

    console.error(`\n${this.errors.length} frame${this.errors.length > 1 ? "s" : ""} failed:\n`);
    for (const e of this.errors) console.error(`  ✘ ${e}`);
    console.error(
      "\nThese files were written but are not usable as-is. Fix the copy and re-render;\n" +
        "do not hand them over — an ad whose disclosure is covered is a compliance problem,\n" +
        "not a cosmetic one.",
    );
    return failOnError;
  }
}

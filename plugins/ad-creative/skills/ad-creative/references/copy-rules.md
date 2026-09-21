# Writing the copy

The creative is the easy half. Copy is where an ad becomes either persuasive or a legal problem.

## Claims that are not style preferences

These sit in `brand.json` under `claims.forbidden` because they are Australian Consumer Law and
platform-policy matters. Keep them unless the client can evidence the claim in writing:

- **No star ratings, review counts, testimonials or `AggregateRating` markup** until there are real,
  named, attributable reviews. Fabricated or implied review signals are an active ACCC enforcement
  priority, and invented review markup is separately a Google manual-action risk.
- **No client roster you can't name.** "Hundreds of businesses" and "our clients" both imply proof
  that doesn't exist.
- **No implied headcount.** "Our team" is honest for two people; "our engineers come to you" is not
  if only one attends.
- **No performance guarantee** without written sign-off. "If it doesn't work you don't pay" is a
  contractual promise, not a tagline.
- **No competitor copy.** Website copy is a protected literary work — a lifted sentence, heading or
  FAQ answer is infringement. If a line feels familiar, rewrite it from blank.
- **Prices carry their tax treatment** — "+ GST" in Australia — and two different offers never
  appear against each other's price.

## Scarcity, honestly

Scarcity converts, which is exactly why it attracts trouble.

- **A total is safe; a live count is not.** "Ten seats" is a fixed fact. "Three seats left" has to
  be true at the moment every impression is served, and an ad served for a week cannot guarantee
  that. Never wire a live counter into a creative.
- **Don't promise what the click can't deliver.** If applications are reviewed, "Secure your seat"
  states an outcome the click doesn't produce. "Apply now" or "Request a seat" is the honest form,
  and the qualifying line — "applications reviewed, we call to check fit" — belongs in the creative
  itself rather than only on the landing page.
- **A real date beats "limited time".** It's more concrete and it can't drift into being false.

## Voice

`brand.json` carries the voice description and the banned-word list. The general shape that works:

- **Address one person.** "You", not "businesses like yours".
- **Name the actual task.** "Chasing overdue invoices", not "financial workflows". Name the tool:
  Gmail, Xero, ServiceM8.
- **Saying no is a trust signal.** "We'll tell you if this won't fix it" is a claim you can back.
- **No numbers you can't show.** No time savings or percentages unless they came from real work.

Check every line against `voice.bannedWords` before rendering. Words like "unlock", "seamless" and
"transform your business" are on the list because they make an ad sound like every other ad — the
reader learns nothing and trusts less.

## Ad and landing page must agree

Use the landing page's own words for the CTA and the qualifying line. A visitor who clicks "Grab
your seat" and lands on a page saying "Apply now" experiences a small jolt that costs conversion,
and Meta scores the mismatch as a quality signal. This is also the cheapest possible copy decision —
the words already exist.

## Variants

Write three or four headline variants and change **one thing at a time** between them. Layout, date,
qualifying line and CTA stay identical so the test actually measures the headline.

Judge on qualified outcomes, not clicks. If the funnel sorts applicants after the click, raw volume
tells you almost nothing about which headline did better.

## Counting characters

Count programmatically rather than by eye — an em dash, a curly apostrophe and a non-breaking space
all cost more than they look, and being two characters over means truncation mid-word in the feed.

```bash
python3 -c "s='Your line here'; print(len(s), s)"
```

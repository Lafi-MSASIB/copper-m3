// Cuts one page of a document into passages of a few sentences each. A passage
// is the unit the search returns, so it should be small enough to be about one
// thing, and big enough to make sense by itself.

/** About three or four sentences. */
const MAX_CHARS = 450;
/** Anything shorter than this (a page number, a stray heading) isn't worth keeping alone. */
const MIN_CHARS = 40;

/**
 * Splits page text into lines, then joins wrapped lines back into sentences or
 * table rows: a new unit starts after a line ending in . ! ? or :, and when the
 * next line doesn't start with a lowercase letter.
 */
function unitsOf(pageText: string): string[] {
  const lines = pageText
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const units: string[] = [];
  for (const line of lines) {
    const last = units.at(-1);
    const wrapped =
      last !== undefined && !/[.!?:]$/.test(last) && /^[a-z]/.test(line);
    if (wrapped) units[units.length - 1] = `${last} ${line}`;
    else units.push(line);
  }
  // A long unit with several sentences is split at the sentence ends.
  return units.flatMap((unit) => unit.split(/(?<=[.!?])\s+(?=[A-Z0-9])/));
}

/** Groups the units of a page into passages of at most MAX_CHARS characters. */
export function splitIntoPassages(pageText: string): string[] {
  const passages: string[] = [];
  let current = "";
  for (const unit of unitsOf(pageText)) {
    if (current && current.length + 1 + unit.length > MAX_CHARS) {
      passages.push(current);
      current = unit;
    } else {
      current = current ? `${current} ${unit}` : unit;
    }
  }
  if (current) passages.push(current);

  // Fold a tiny last passage into the one before it.
  if (passages.length > 1 && passages.at(-1)!.length < MIN_CHARS) {
    const tail = passages.pop()!;
    passages[passages.length - 1] += ` ${tail}`;
  }
  return passages.filter((passage) => passage.length >= MIN_CHARS);
}

// Builds the support-docs index, once: reads every PDF in public/docs, cuts each
// page into passages of a few sentences, starts each passage with its document
// title, embeds them with Gemini, and saves everything to one JSON file that the
// app loads into memory when it starts.
//
// Run it with:  npm run index
// (It reads GOOGLE_GENERATIVE_AI_API_KEY from .env.local; the key is never printed.)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { callEmbed } from "@/lib/ai/call";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/ai/models";
import { DOCUMENTS } from "@/lib/copper/documents";
import { splitIntoPassages } from "@/lib/copper/docs/passages";
import type { DocIndex, Passage } from "@/lib/copper/docs/types";

const OUTPUT = "lib/copper/data/doc-index.json";
const BATCH = 50;

/** The text of each page of a PDF, with a line break at the end of every line. */
async function readPages(file: string): Promise<string[]> {
  const data = new Uint8Array(await readFile(path.join("public", file)));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push(text);
  }
  return pages;
}

const passages: Omit<Passage, "embedding">[] = [];
const counts: Record<string, { pages: number; passages: number }> = {};

for (const doc of DOCUMENTS) {
  const pages = await readPages(doc.file);
  let made = 0;
  pages.forEach((pageText, index) => {
    for (const body of splitIntoPassages(pageText)) {
      made++;
      passages.push({
        id: `${doc.id}-p${index + 1}-${made}`,
        docId: doc.id,
        title: doc.title,
        page: index + 1,
        text: `${doc.title}: ${body}`,
      });
    }
  });
  counts[doc.title] = { pages: pages.length, passages: made };
}

// Dry run: show how the pages were cut, and call nothing. Useful for checking
// a passage before paying for embeddings, e.g.  npm run index -- --dry --find=C-31
if (process.argv.includes("--dry")) {
  const find = process.argv.find((a) => a.startsWith("--find="))?.slice(7);
  for (const [title, c] of Object.entries(counts)) {
    console.log(`${title}: ${c.passages} passages from ${c.pages} pages`);
  }
  for (const p of passages.filter((p) => find && p.text.includes(find))) {
    console.log(`\n[${p.title}, p. ${p.page}]\n${p.text}`);
  }
  process.exit(0);
}

// The slow part: one embedding per passage, in batches.
const embeddings: number[][] = [];
for (let start = 0; start < passages.length; start += BATCH) {
  const batch = passages.slice(start, start + BATCH).map((p) => p.text);
  embeddings.push(
    ...(await callEmbed(
      { module: 3, feature: "build-index" },
      batch,
      "RETRIEVAL_DOCUMENT",
    )),
  );
}

// Five decimals is plenty for comparing meaning, and keeps the file small.
const round = (n: number) => Math.round(n * 1e5) / 1e5;
const index: DocIndex = {
  model: EMBEDDING_MODEL.id,
  dimensions: EMBEDDING_DIMENSIONS,
  passages: passages.map((p, i) => ({
    ...p,
    embedding: embeddings[i].map(round),
  })),
};
await writeFile(OUTPUT, JSON.stringify(index));

console.log(`Saved ${index.passages.length} passages to ${OUTPUT}`);
for (const [title, c] of Object.entries(counts)) {
  console.log(`  ${title}: ${c.passages} passages from ${c.pages} pages`);
}

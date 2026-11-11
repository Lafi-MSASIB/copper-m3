// Searches Copper's support documents by meaning. The index (every passage and
// its embedding) is loaded into memory once, when the app starts; a question
// only has to be embedded itself, then compared with every passage.
import { callEmbed } from "@/lib/ai/call";
import index from "@/lib/copper/data/doc-index.json";
import type { DocIndex, Passage } from "@/lib/copper/docs/types";
import { DOCUMENTS } from "@/lib/copper/documents";

const INDEX = index as DocIndex;

/** How many passages a search returns. */
export const RESULT_COUNT = 5;

/** One passage found by a search, with where to read it. */
export type DocHit = {
  title: string;
  page: number;
  /** Opens the PDF at that page. */
  url: string;
  /** The passage, without its document-title prefix. */
  text: string;
};

export type SearchResult =
  | { status: "ok"; passages: DocHit[] }
  | { status: "unavailable"; message: string };

/** How alike two embeddings are: 1 means the same direction (same meaning). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

/** The `count` passages whose meaning is closest to the question's, best first. */
export function closestPassages(
  question: number[],
  passages: Passage[],
  count = RESULT_COUNT,
): Passage[] {
  return passages
    .map((passage) => ({ passage, score: cosine(question, passage.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ passage }) => passage);
}

function hitFor(passage: Passage): DocHit {
  const doc = DOCUMENTS.find((d) => d.id === passage.docId);
  return {
    title: passage.title,
    page: passage.page,
    url: `${doc?.file ?? ""}#page=${passage.page}`,
    // Passages are stored starting with "<title>: "; the title is shown apart.
    text: passage.text.slice(passage.title.length + 2),
  };
}

/** search_docs: the passages of the support docs closest in meaning to a question. */
export async function searchDocs(question: string): Promise<SearchResult> {
  try {
    const [embedding] = await callEmbed(
      { module: 3, feature: "search-docs" },
      [question],
      "RETRIEVAL_QUERY",
    );
    return {
      status: "ok",
      passages: closestPassages(embedding, INDEX.passages).map(hitFor),
    };
  } catch {
    return {
      status: "unavailable",
      message:
        "The support docs can't be searched right now. Please try again soon.",
    };
  }
}

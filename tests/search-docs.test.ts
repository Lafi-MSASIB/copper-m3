// Ask Copper reads the docs: cutting pages into passages, finding the closest
// ones by meaning, and the index itself. The embedding call is faked, so these
// need no AI key and cost nothing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENTS } from "@/lib/copper/documents";
import { splitIntoPassages } from "@/lib/copper/docs/passages";
import type { DocIndex, Passage } from "@/lib/copper/docs/types";
import index from "@/lib/copper/data/doc-index.json";

const INDEX = index as DocIndex;

// A fake question embedding: same direction as a stored passage's.
let questionEmbedding: number[] | Error = [1, 0];
vi.mock("@/lib/ai/call", () => ({
  callEmbed: async () => {
    if (questionEmbedding instanceof Error) throw questionEmbedding;
    return [questionEmbedding];
  },
}));

afterEach(() => {
  questionEmbedding = [1, 0];
});

describe("splitIntoPassages", () => {
  it("joins wrapped lines and keeps every passage short", () => {
    const page = [
      "Copper Notes records and transcribes without Wi-Fi. It uploads",
      "transcripts to the Copper app the next time it is on Wi-Fi.",
      "If it cannot upload for a long time, its storage fills up.",
      "Charge it on its puck. A full charge takes about two hours.",
      "Keep it away from heat. Never leave it in a parked car.",
    ].join("\n");
    const passages = splitIntoPassages(page);
    expect(passages.join(" ")).toContain("uploads transcripts to the Copper");
    for (const passage of passages)
      expect(passage.length).toBeLessThanOrEqual(520);
  });

  it("splits a long page into several passages and drops stray page numbers", () => {
    const sentence =
      "Copper Home has a ring of lights that shows what it is doing.";
    const passages = splitIntoPassages(
      `${Array(20).fill(sentence).join(" ")}\n8`,
    );
    expect(passages.length).toBeGreaterThan(1);
    expect(passages.every((p) => p.length >= 40)).toBe(true);
  });
});

describe("the doc index", () => {
  it("covers every document, with the page counts the PDFs have", () => {
    const pagesByDoc: Record<string, number> = {
      "copper-home-user-guide": 10,
      "copper-notes-user-guide": 9,
      "copper-terms-and-conditions": 7,
      "copper-plus-faq": 6,
    };
    for (const doc of DOCUMENTS) {
      const mine = INDEX.passages.filter((p) => p.docId === doc.id);
      expect(mine.length, `${doc.title} has passages`).toBeGreaterThan(0);
      for (const p of mine) {
        expect(p.page).toBeGreaterThanOrEqual(1);
        expect(p.page).toBeLessThanOrEqual(pagesByDoc[doc.id]);
        expect(p.title).toBe(doc.title);
        expect(p.text.startsWith(`${doc.title}: `)).toBe(true);
      }
    }
  });

  it("has one embedding of the same size for every passage, and unique ids", () => {
    expect(INDEX.passages.length).toBeGreaterThan(0);
    for (const p of INDEX.passages) {
      expect(p.embedding).toHaveLength(INDEX.dimensions);
    }
    expect(new Set(INDEX.passages.map((p) => p.id)).size).toBe(
      INDEX.passages.length,
    );
  });

  it("keeps the Copper Notes error table together: C-31 is on page 8 and says storage is full", () => {
    const row = INDEX.passages.find(
      (p) =>
        p.docId === "copper-notes-user-guide" &&
        p.page === 8 &&
        p.text.includes("C-31"),
    );
    expect(row?.text).toMatch(/C-31 Storage full/);
  });

  it("states the annual refund rule from the Copper Plus FAQ", () => {
    const refund = INDEX.passages.find(
      (p) => p.docId === "copper-plus-faq" && /full refund/i.test(p.text),
    );
    expect(refund?.text).toMatch(/14 days/);
  });
});

describe("closestPassages and cosine", () => {
  const make = (id: string, embedding: number[]): Passage => ({
    id,
    docId: "copper-plus-faq",
    title: "Copper Plus FAQ",
    page: 1,
    text: `Copper Plus FAQ: ${id}`,
    embedding,
  });

  it("measures how alike two embeddings are", async () => {
    const { cosine } = await import("@/lib/copper/docs/search");
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });

  it("returns the closest passages first, and no more than asked for", async () => {
    const { closestPassages } = await import("@/lib/copper/docs/search");
    const passages = [
      make("far", [0, 1]),
      make("near", [1, 0.1]),
      make("nearest", [1, 0]),
      make("middle", [1, 1]),
    ];
    expect(closestPassages([1, 0], passages, 3).map((p) => p.id)).toEqual([
      "nearest",
      "near",
      "middle",
    ]);
  });
});

describe("searchDocs", () => {
  it("returns the 5 closest passages, each with its title, page and a link to that page", async () => {
    const target = INDEX.passages.find(
      (p) => p.docId === "copper-notes-user-guide",
    )!;
    questionEmbedding = target.embedding;
    const { searchDocs } = await import("@/lib/copper/docs/search");
    const result = await searchDocs("whatever");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.passages).toHaveLength(5);
    // The passage whose embedding we asked with is the closest.
    expect(result.passages[0]).toMatchObject({
      title: "Copper Notes User Guide",
      page: target.page,
      url: `/docs/copper-notes-user-guide.pdf#page=${target.page}`,
    });
    expect(result.passages[0].text).not.toMatch(/^Copper Notes User Guide: /);
    for (const hit of result.passages) {
      expect(hit.url).toMatch(/^\/docs\/[a-z-]+\.pdf#page=\d+$/);
    }
  });

  it("says the docs can't be searched when the embedding fails, and doesn't throw", async () => {
    questionEmbedding = new Error("no key");
    const { searchDocs } = await import("@/lib/copper/docs/search");
    const result = await searchDocs("whatever");
    expect(result.status).toBe("unavailable");
  });
});

describe("the search_docs tool", () => {
  it("is one of Copper's tools, described for the model, and needs a question", async () => {
    const { copperTools, searchDocsInput } =
      await import("@/lib/copper/assistant/tools");
    expect(Object.keys(copperTools)).toContain("search_docs");
    expect(copperTools.search_docs.description).toMatch(/support documents/i);
    expect(searchDocsInput.safeParse({ question: "C-47" }).success).toBe(true);
    expect(searchDocsInput.safeParse({}).success).toBe(false);
  });

  it("is told to Copper: answer only from the passages, cite every sentence, and say when it can't find it", async () => {
    const { COPPER_INSTRUCTIONS } =
      await import("@/lib/copper/assistant/instructions");
    expect(COPPER_INSTRUCTIONS).toMatch(/search_docs/);
    expect(COPPER_INSTRUCTIONS).toMatch(/cite|citation/i);
    expect(COPPER_INSTRUCTIONS).toContain(
      "I couldn't find that in our support docs",
    );
    expect(COPPER_INSTRUCTIONS).toMatch(/Copper Crew/);
  });
});

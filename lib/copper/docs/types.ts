// The shape of the support-docs index (lib/copper/data/doc-index.json), which
// scripts/build-index.ts writes and lib/copper/docs/search.ts reads.

/** A few sentences from one page of one document, with its embedding. */
export type Passage = {
  id: string;
  /** Matches an id in lib/copper/documents.ts. */
  docId: string;
  title: string;
  /** 1-based page number in the PDF. */
  page: number;
  /** Starts with the document title: "Copper Home User Guide: ..." */
  text: string;
  /** The passage's meaning as a list of numbers. */
  embedding: number[];
};

export type DocIndex = {
  model: string;
  dimensions: number;
  passages: Passage[];
};

// When the model call fails, the shopper sees the apology and the real reason
// goes to the server log (so it shows up in Vercel's logs). Google is faked, so
// these need no AI key and cost nothing.
import { finalValue } from "@/lib/ai/live";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let model: MockLanguageModelV4;
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => model,
}));

const question = [
  { role: "user" as const, content: "Can I get a refund on an annual plan?" },
];

async function failingAsk(useTools: boolean) {
  vi.resetModules();
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
  const { askCopper } = await import("@/lib/copper/assistant/ask");
  const result = await askCopper({ messages: question, useTools });
  return finalValue(result.progress);
}

describe("askCopper failures", () => {
  let errors: string[];

  beforeEach(() => {
    errors = [];
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
    model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("The model is overloaded. Please try again later.");
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([true, false])(
    "logs the real reason and shows the apology (tools: %s)",
    async (useTools) => {
      const result = await failingAsk(useTools);
      expect(result.status).toBe("error");
      expect(result.reply).toBe(
        "Sorry, something went wrong on my end. Please try again.",
      );
      expect(errors.join("\n")).toContain("[ask-copper]");
      expect(errors.join("\n")).toContain("overloaded");
    },
  );

  it("says plainly when Google's free daily limit is used up", async () => {
    model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error(
          "You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 20",
        );
      },
    });
    const result = await failingAsk(true);
    expect(result.status).toBe("error");
    expect(result.reply).toMatch(/free question limit.*tomorrow/i);
    expect(errors.join("\n")).toContain("quota");
  });

  it("never logs the API key", async () => {
    await failingAsk(true);
    expect(errors.join("\n")).not.toContain("AIza-test-key");
  });
});

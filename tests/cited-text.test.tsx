import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CitedText } from "@/components/copper/cited-text";

describe("CitedText", () => {
  it("turns a citation into a link that opens that page of the PDF", () => {
    render(
      <p>
        <CitedText text="Unplug it for 30 seconds. [Copper Home User Guide, p. 9](/docs/copper-home-user-guide.pdf#page=9)" />
      </p>,
    );
    const link = screen.getByTestId("citation");
    expect(link).toHaveTextContent("[Copper Home User Guide, p. 9]");
    expect(link).toHaveAttribute(
      "href",
      "/docs/copper-home-user-guide.pdf#page=9",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("only links to our own docs, never anywhere else", () => {
    render(
      <p>
        <CitedText text="See [here](https://example.com/phish) for details." />
      </p>,
    );
    expect(screen.queryByTestId("citation")).toBeNull();
    expect(screen.getByText(/See \[here\] for details\./)).toBeInTheDocument();
  });

  it("leaves a plain answer alone", () => {
    render(
      <p data-testid="plain">
        <CitedText text="I couldn't find that in our support docs." />
      </p>,
    );
    expect(screen.getByTestId("plain")).toHaveTextContent(
      "I couldn't find that in our support docs.",
    );
  });
});

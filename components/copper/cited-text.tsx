// Copper cites its sources like [Copper Home User Guide, p. 9](/docs/...pdf#page=9).
// This shows each citation as a link that opens that page. Only links to our own
// /docs/ pages become links, so the model can't send a shopper anywhere else.
export function CitedText({ text }: { text: string }) {
  return text.split(/(\[[^\]]+\]\([^)\s]+\))/).map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (!match) return part;
    const [, label, href] = match;
    if (!href.startsWith("/docs/")) return `[${label}]`;
    return (
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noreferrer"
        data-testid="citation"
        className="text-primary font-medium underline underline-offset-2"
      >
        [{label}]
      </a>
    );
  });
}

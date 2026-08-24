import { Fragment, type ReactNode } from "react";

/**
 * A deliberately tiny markdown renderer.
 *
 * The system prompt constrains the model to `##` headings, `-` bullets,
 * `**bold**`, inline `code` and fenced code blocks, so that is exactly what
 * this handles. Pulling in react-markdown to render six headings would be an
 * odd look for a tool whose entire pitch is bundle size.
 *
 * Anything outside the subset degrades to plain text rather than breaking, and
 * nothing here uses dangerouslySetInnerHTML — model output is rendered as text
 * nodes, so it cannot inject markup.
 */

function renderInline(text: string): ReactNode {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter((t) => t !== "");
  return tokens.map((token, i) => {
    if (token.length > 2 && token.startsWith("`") && token.endsWith("`")) {
      return (
        <code
          key={i}
          className="font-mono text-[0.9em] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1 py-0.5"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.length > 4 && token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={i}>{token}</Fragment>;
  });
}

export default function Markdown({ children }: { children: string }) {
  const lines = children.split("\n");
  const blocks: ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block. An unterminated fence (common mid-stream) still
    // renders everything collected so far.
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence if present
      blocks.push(
        <pre
          key={blocks.length}
          className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 overflow-x-auto font-mono leading-relaxed text-[var(--text)]"
        >
          {code.join("\n")}
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <h4
          key={blocks.length}
          className="text-sm font-semibold text-[var(--text)] mt-1"
        >
          {renderInline(heading[2])}
        </h4>
      );
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={blocks.length} className="space-y-1.5 pl-1">
          {items.map((item, n) => (
            <li key={n} className="flex gap-2 text-sm text-[var(--text)] leading-relaxed">
              <span className="text-[var(--brand)] shrink-0">•</span>
              <span className="min-w-0">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Consecutive non-blank lines form one paragraph.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith("```")
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={blocks.length} className="text-sm text-[var(--text)] leading-relaxed">
        {renderInline(para.join(" "))}
      </p>
    );
  }

  return <div className="space-y-3">{blocks}</div>;
}

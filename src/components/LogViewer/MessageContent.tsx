"use client";

import * as React from "react";

type Props = {
  text: string;
  className?: string;
};

// Parser estremamente semplice per un sottoinsieme di Markdown:
// - Titoli: linee che iniziano con "## " o "# "
// - Liste: linee che iniziano con "- " o "* "
// - Bold: **testo**
// - Code inline: `code`
// - Link: [label](url)
// - Paragrafi separati da linee vuote
export default function MessageContent({ text, className }: Props) {
  const lines = React.useMemo(() => text.split(/\r?\n/), [text]);

  const blocks: Array<
    | { type: "h1"; content: string }
    | { type: "h2"; content: string }
    | { type: "ul"; items: string[] }
    | { type: "p"; content: string }
  > = [];

  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push({ type: "ul", items: listBuffer });
      listBuffer = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().length === 0) {
      // paragrafo chiuso / lista chiusa
      flushList();
      continue;
    }

    if (line.startsWith("# ")) {
      flushList();
      blocks.push({ type: "h1", content: line.slice(2).trim() });
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      blocks.push({ type: "h2", content: line.slice(3).trim() });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      // elemento di lista
      listBuffer.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }

    // linea normale: paragrafo
    flushList();
    blocks.push({ type: "p", content: line });
  }
  flushList();

  // Renderer inline: bold, code, link basilari
  const renderInline = (s: string, keyPrefix: string) => {
    const parts: React.ReactNode[] = [];
    let rest = s;
    let idx = 0;

    const pushText = (t: string) => {
      if (!t) return;
      parts.push(<span key={`${keyPrefix}-txt-${idx++}`}>{t}</span>);
    };

    while (rest.length) {
      // code inline `...`
      const codeMatch = rest.match(/`([^`]+)`/);
      const boldMatch = rest.match(/\*\*([^*]+)\*\*/);
      const linkMatch = rest.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);

      // Trova la prima occorrenza tra code/bold/link
      const candidates: Array<{ type: "code" | "bold" | "link"; start: number; match: RegExpMatchArray | null }> = [
        { type: "code", start: codeMatch ? codeMatch.index ?? -1 : -1, match: codeMatch },
        { type: "bold", start: boldMatch ? boldMatch.index ?? -1 : -1, match: boldMatch },
        { type: "link", start: linkMatch ? linkMatch.index ?? -1 : -1, match: linkMatch },
      ].filter((c) => c.start >= 0);

      if (candidates.length === 0) {
        pushText(rest);
        break;
      }

      candidates.sort((a, b) => a.start - b.start);
      const first = candidates[0];
      const m = first.match!;
      const start = first.start;
      const end = start + m[0].length;

      pushText(rest.slice(0, start));

      if (first.type === "code") {
        parts.push(
          <code key={`${keyPrefix}-code-${idx++}`} className="px-1 py-0.5 rounded bg-muted font-mono text-[0.9em]">
            {m[1]}
          </code>
        );
      } else if (first.type === "bold") {
        parts.push(
          <strong key={`${keyPrefix}-b-${idx++}`} className="font-semibold">
            {m[1]}
          </strong>
        );
      } else if (first.type === "link") {
        parts.push(
          <a
            key={`${keyPrefix}-a-${idx++}`}
            href={m[2]}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 text-primary hover:opacity-80"
          >
            {m[1]}
          </a>
        );
      }

      rest = rest.slice(end);
    }

    return parts;
  };

  return (
    <div className={["space-y-2 leading-relaxed", className].filter(Boolean).join(" ")}>
      {blocks.map((b, i) => {
        if (b.type === "h1") {
          return (
            <h3 key={`h1-${i}`} className="text-base font-semibold">
              {renderInline(b.content, `h1-${i}`)}
            </h3>
          );
        }
        if (b.type === "h2") {
          return (
            <h4 key={`h2-${i}`} className="text-sm font-semibold">
              {renderInline(b.content, `h2-${i}`)}
            </h4>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={`ul-${i}`} className="list-disc pl-5 space-y-1">
              {b.items.map((it, j) => (
                <li key={`ul-${i}-${j}`}>{renderInline(it, `ul-${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`p-${i}`} className="text-sm">
            {renderInline(b.content, `p-${i}`)}
          </p>
        );
      })}
    </div>
  );
}
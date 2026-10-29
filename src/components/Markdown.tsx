"use client";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** Models often emit \( \) and \[ \]; remark-math expects $ / $$. Leave code blocks alone. */
export function normalizeMath(src: string) {
  return src
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`),
    )
    .join("");
}

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        urlTransform={(url) => url} // allow data: image URLs from image generation
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => (typeof src === "string" ? <img src={src} alt={alt ?? ""} loading="lazy" /> : null),
        }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
});

// Hover documentation for elements, attributes and expression members.

import { analyze, wordAt } from "./document.ts";
import { hoverAt } from "./csharp.ts";
import { childNamed, scopeAt, type Child } from "./schema.ts";

/** Markdown for the thing at `offset`, or null. */
export function hover(text: string, offset: number): string | null {
  const here = analyze(text, offset);
  if (here.kind === "expression") {
    let end = offset;
    while (end < text.length && /\w/.test(text[end]!)) end++;
    const code = text.slice(here.codeStart, end);
    const result = hoverAt(code);
    if (!result) return null;
    return ["```csharp", result.signature, "```", ...(result.doc ? [result.doc] : [])].join("\n");
  }

  // Classify the end of the hovered word, so the whole name is seen.
  const cursor = analyze(text, wordAt(text, offset).end);
  switch (cursor.kind) {
    case "tag-name": {
      const name = text.slice(cursor.start, cursor.end);
      const child = childNamed(scopeAt(cursor.stack), name);
      return child ? elementHover(child) : null;
    }
    case "end-tag": {
      const name = text.slice(cursor.start, cursor.end);
      const child = childNamed(scopeAt(cursor.stack.slice(0, -1)), name);
      return child ? elementHover(child) : null;
    }
    case "attribute-name": {
      const name = text.slice(cursor.start, cursor.end);
      const attribute = childNamed(scopeAt(cursor.stack), cursor.tag)?.spec.attributes.find((candidate) => candidate.name === name);
      if (!attribute) return null;
      const lines = [`**${attribute.name}**${attribute.required ? " (required)" : ""}`, attribute.description];
      if (attribute.default !== null) lines.push(`**Default:** \`${attribute.default}\``);
      if (attribute.values.length) lines.push(`**Values:** ${attribute.values.map((value) => `\`${value}\``).join(", ")}`);
      return lines.filter(Boolean).join("\n\n");
    }
    default:
      return null;
  }
}

function elementHover({ spec, policy }: Child): string {
  const lines = [`**${spec.name}**${policy ? " policy" : ""}`, policy?.description ?? spec.description ?? ""];
  if (policy?.sections.length) lines.push(`**Sections:** ${policy.sections.join(", ")}`);
  if (spec.attributes.length) {
    lines.push(spec.attributes.map((attribute) => `- \`${attribute.name}\`${attribute.required ? " (required)" : ""}`).join("\n"));
  }
  if (policy?.docUrl) lines.push(`[Policy reference](${policy.docUrl})`);
  return lines.filter(Boolean).join("\n\n");
}

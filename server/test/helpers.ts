import { complete } from "../src/completion.ts";

/** Splits a fixture at its `▮` cursor marker. */
export function at(source: string): { text: string; offset: number } {
  const offset = source.indexOf("▮");
  if (offset < 0) throw new Error("fixture has no ▮ cursor");
  return { text: source.slice(0, offset) + source.slice(offset + 1), offset };
}

/** Completion labels at the fixture's cursor. */
export function labels(source: string, options: { trigger?: string; namedValues?: string[] } = {}): string[] {
  return items(source, options).map((item) => item.label);
}

export function items(source: string, options: { trigger?: string; namedValues?: string[] } = {}) {
  const { text, offset } = at(source);
  return complete({
    text,
    offset,
    ...(options.trigger && { trigger: options.trigger }),
    namedValues: options.namedValues ?? [],
    toRange: (start, end) => ({ start: { line: 0, character: start }, end: { line: 0, character: end } }),
  });
}

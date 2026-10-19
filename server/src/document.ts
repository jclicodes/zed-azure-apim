// Works out what the cursor is inside of in an APIM policy document.
//
// Documents being edited are rarely well-formed, so this is a tolerant forward
// scan rather than a parser: it tracks the stack of open elements and stops at
// the cursor. Policy expressions are matched by bracket balancing, exactly as
// the gateway (and the tree-sitter grammar's scanner) does.

export type Cursor =
  /** Typing an element name after `<`; `start..end` is the name typed so far. */
  | { kind: "tag-name"; stack: string[]; start: number; end: number }
  /** Typing an element name after `</`. */
  | { kind: "end-tag"; stack: string[]; start: number; end: number }
  /** Inside a start tag where an attribute name goes. */
  | { kind: "attribute-name"; stack: string[]; tag: string; present: string[]; start: number; end: number }
  /** Inside a literal attribute value; `start..end` spans the whole value. */
  | { kind: "attribute-value"; stack: string[]; tag: string; attribute: string; start: number; end: number }
  /** Inside the C# of `@(...)` / `@{...}`; `code` runs from the opening bracket to the cursor. */
  | { kind: "expression"; stack: string[]; tag?: string; attribute?: string; codeStart: number; code: string }
  /** After `{{` of a named value reference; `closed` if `}}` already follows the name. */
  | { kind: "named-value"; start: number; end: number; closed: boolean }
  /** Element content; `start..end` is the word around the cursor. */
  | { kind: "text"; stack: string[]; start: number; end: number }
  /** Comments, CDATA, end tags and other places with nothing to offer. */
  | { kind: "none" };

const NONE: Cursor = { kind: "none" };

const isNameStart = (c: string | undefined) => c !== undefined && /[A-Za-z_]/.test(c);
const isNameChar = (c: string | undefined) => c !== undefined && /[\w.:-]/.test(c);
const isSpace = (c: string | undefined) => c === " " || c === "\t" || c === "\n" || c === "\r";

function scanName(text: string, i: number): number {
  if (!isNameStart(text[i])) return i;
  while (isNameChar(text[i])) i++;
  return i;
}

/** Extent of the element-name-like word (letters, digits, `-`, `_`) around `offset`. */
export function wordAt(text: string, offset: number): { start: number; end: number } {
  let start = offset;
  while (start > 0 && /[\w-]/.test(text[start - 1]!)) start--;
  let end = offset;
  while (end < text.length && /[\w-]/.test(text[end]!)) end++;
  return { start, end };
}

/**
 * Index of the bracket closing C# code that starts at `i`, or -1 if the code
 * runs to the end of the text. Brackets inside string and char literals,
 * comments and interpolated-string text don't count.
 */
export function scanCode(text: string, i: number, open: string, close: string): number {
  let depth = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === close) {
      if (depth === 0) return i;
      depth--;
      i++;
    } else if (c === open) {
      depth++;
      i++;
    } else if (c === '"') {
      i = scanString(text, i + 1, false, false);
    } else if (c === "'") {
      i = scanChar(text, i + 1);
    } else if (c === "@" || c === "$") {
      let verbatim = c === "@";
      let interpolated = c === "$";
      i++;
      if (text[i] === "@" || text[i] === "$") {
        verbatim ||= text[i] === "@";
        interpolated ||= text[i] === "$";
        i++;
      }
      if (text[i] === '"') i = scanString(text, i + 1, verbatim, interpolated);
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else {
      i++;
    }
  }
  return -1;
}

// `i` is just past the opening quote; returns the index after the closing one.
// Regular strings stop at a newline so an unterminated one can't swallow the
// rest of the document.
function scanString(text: string, i: number, verbatim: boolean, interpolated: boolean): number {
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      if (verbatim && text[i + 1] === '"') {
        i += 2;
        continue;
      }
      return i + 1;
    }
    if (!verbatim && (c === "\n" || c === "\r")) return i;
    if (!verbatim && c === "\\") {
      i += 2;
      continue;
    }
    if (interpolated && c === "{") {
      if (text[i + 1] === "{") {
        i += 2;
        continue;
      }
      const end = scanCode(text, i + 1, "{", "}");
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    i++;
  }
  return i;
}

function scanChar(text: string, i: number): number {
  while (i < text.length) {
    const c = text[i]!;
    if (c === "\n" || c === "\r") return i;
    i++;
    if (c === "'") return i;
    if (c === "\\") i++;
  }
  return i;
}

type TagPart =
  | { type: "attribute"; name: string; nameStart: number; nameEnd: number; end: number; value?: AttributeValue }
  | { type: "end"; at: number; next: number; opens: boolean };

type AttributeValue = { start: number; end: number; code?: { start: number; close: number } };

// Yields the attributes of the start tag whose name ends at `i`, then how it
// ends. A tag cut short by `<` or the end of the text doesn't open an element.
function* tagParts(text: string, i: number): Generator<TagPart> {
  while (true) {
    while (isSpace(text[i])) i++;
    if (i >= text.length || text[i] === "<") return yield { type: "end", at: i, next: i, opens: false };
    if (text[i] === ">") return yield { type: "end", at: i, next: i + 1, opens: true };
    if (text.startsWith("/>", i)) return yield { type: "end", at: i, next: i + 2, opens: false };
    if (!isNameStart(text[i])) {
      i++;
      continue;
    }
    const nameStart = i;
    const nameEnd = scanName(text, i);
    const part: TagPart & { type: "attribute" } = { type: "attribute", name: text.slice(nameStart, nameEnd), nameStart, nameEnd, end: nameEnd };
    i = nameEnd;
    while (isSpace(text[i])) i++;
    if (text[i] === "=") {
      i++;
      while (isSpace(text[i])) i++;
      const quote = text[i];
      if (quote === '"' || quote === "'") {
        const start = i + 1;
        let end: number;
        let code: AttributeValue["code"];
        const bracket = text[start + 1];
        if (text[start] === "@" && (bracket === "(" || bracket === "{")) {
          const close = scanCode(text, start + 2, bracket, bracket === "(" ? ")" : "}");
          code = { start: start + 2, close };
          end = close < 0 ? text.length : text.indexOf(quote, close + 1);
        } else {
          end = text.indexOf(quote, start);
        }
        if (end < 0) end = text.length;
        part.value = { start, end, ...(code && { code }) };
        i = end + 1;
      }
      part.end = i;
    }
    yield part;
  }
}

/** Classifies `offset` in `text`. */
export function analyze(text: string, offset: number): Cursor {
  const stack: string[] = [];
  let i = 0;
  while (i < offset) {
    const c = text[i];
    if (c === "<") {
      const skipTo = (terminator: string, from: number) => {
        const end = text.indexOf(terminator, from);
        return end < 0 || end + terminator.length > offset ? -1 : end + terminator.length;
      };
      if (text.startsWith("<!--", i) || text.startsWith("<![CDATA[", i) || text.startsWith("<?", i)) {
        const terminator = text[i + 1] === "?" ? "?>" : text[i + 2] === "-" ? "-->" : "]]>";
        i = skipTo(terminator, i + 2);
        if (i < 0) return NONE;
        continue;
      }
      if (text[i + 1] === "/") {
        const start = i + 2;
        const end = scanName(text, start);
        if (offset <= end) return { kind: "end-tag", stack, start, end };
        const name = text.slice(start, end);
        const at = stack.lastIndexOf(name);
        if (at >= 0) stack.length = at;
        i = skipTo(">", end);
        if (i < 0) return NONE;
        continue;
      }
      const nameStart = i + 1;
      const nameEnd = scanName(text, nameStart);
      if (offset <= nameEnd) return { kind: "tag-name", stack, start: nameStart, end: nameEnd };
      if (nameEnd === nameStart) {
        i++;
        continue;
      }
      const tag = text.slice(nameStart, nameEnd);
      const cursor = cursorInTag(text, offset, stack, tag, nameEnd);
      if (typeof cursor !== "number") return cursor;
      i = cursor;
      continue;
    }
    if (c === "@" && (text[i + 1] === "(" || text[i + 1] === "{")) {
      const codeStart = i + 2;
      const close = scanCode(text, codeStart, text[i + 1]!, text[i + 1] === "(" ? ")" : "}");
      if (offset >= codeStart && (close < 0 || offset <= close)) {
        return { kind: "expression", stack, codeStart, code: text.slice(codeStart, offset) };
      }
      if (close < 0) return NONE;
      i = close + 1;
      continue;
    }
    if (c === "{" && text[i + 1] === "{") {
      const close = text.indexOf("}}", i + 2);
      if (offset >= i + 2 && (close < 0 || offset <= close)) return namedValueAt(text, i + 2, offset);
      if (close < 0) return NONE;
      i = close + 2;
      continue;
    }
    i++;
  }
  const word = wordAt(text, offset);
  return { kind: "text", stack, start: word.start, end: offset > word.start ? word.end : offset };
}

// Cursor somewhere after the name of the start tag `tag`. Returns the cursor
// context if it's inside the tag, else the index where scanning resumes.
function cursorInTag(text: string, offset: number, stack: string[], tag: string, nameEnd: number): Cursor | number {
  const otherAttributes = (except: number) =>
    [...tagParts(text, nameEnd)].flatMap((p) => (p.type === "attribute" && p.nameStart !== except ? [p.name] : []));
  let previousEnd = nameEnd;
  for (const part of tagParts(text, nameEnd)) {
    const partStart = part.type === "end" ? part.at : part.nameStart;
    if (offset <= partStart) {
      // Between parts: only whitespace before the cursor makes room for a new attribute.
      if (offset === previousEnd) return NONE;
      return { kind: "attribute-name", stack, tag, present: otherAttributes(-1), start: offset, end: offset };
    }
    if (part.type === "end") {
      if (part.opens) stack.push(tag);
      return part.next;
    }
    if (offset <= part.nameEnd) {
      return { kind: "attribute-name", stack, tag, present: otherAttributes(part.nameStart), start: part.nameStart, end: part.nameEnd };
    }
    const value = part.value;
    if (offset < (value?.start ?? part.end)) return NONE;
    if (value && offset <= value.end) {
      if (value.code && offset >= value.code.start && (value.code.close < 0 || offset <= value.code.close)) {
        return { kind: "expression", stack, tag, attribute: part.name, codeStart: value.code.start, code: text.slice(value.code.start, offset) };
      }
      const before = text.slice(value.start, offset);
      const open = before.lastIndexOf("{{");
      if (open >= 0 && !before.includes("}}", open)) return namedValueAt(text, value.start + open + 2, offset);
      return { kind: "attribute-value", stack, tag, attribute: part.name, start: value.start, end: value.end };
    }
    previousEnd = part.end;
  }
  return text.length;
}

function namedValueAt(text: string, start: number, offset: number): Cursor {
  let end = offset;
  while (end < text.length && /[^{}<>"'\s]/.test(text[end]!)) end++;
  return { kind: "named-value", start, end, closed: text.startsWith("}}", end) };
}

// Just enough C# understanding for completion and hover in policy
// expressions: a tokenizer, local variable discovery, and type evaluation of
// member-access chains such as
// `context.Request.Headers.GetValueOrDefault("Authorization", "").AsJwt()?.Claims`.

import { ALLOWED_TYPES, canonicalType, KEYWORDS, membersOf, parseGeneric, STATICS, TYPES, type Member } from "./csharp-model.ts";

type Token = { kind: "ident" | "punct" | "string" | "number" | "char"; text: string; start: number; end: number };

/** A chain's value: an instance of `type`, the type itself for static access, or a namespace. */
type Value = { type: string; static?: boolean; namespace?: boolean };

type Lexed = { tokens: Token[]; open: boolean };

/**
 * Tokens of the innermost code context that runs to the end of `code`: the
 * code itself, or an interpolation hole like `$"{context.Re`. `open` is set
 * when the code ends inside a string, char literal or comment.
 */
function lexToEnd(code: string): Lexed {
  const result = lex(code, 0, false);
  return result.inner ?? { tokens: result.tokens, open: result.open };
}

type LexResult = Lexed & { end: number; closed: boolean; inner?: Lexed };

// Lexes from `i`. Nested (interpolation hole) lexing stops at the unmatched `}`.
function lex(code: string, i: number, nested: boolean): LexResult {
  const tokens: Token[] = [];
  let depth = 0;
  const unterminated = (): LexResult => ({ tokens, open: true, end: code.length, closed: false });
  while (i < code.length) {
    const c = code[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (code.startsWith("//", i)) {
      const end = code.indexOf("\n", i);
      if (end < 0) return unterminated();
      i = end;
    } else if (code.startsWith("/*", i)) {
      const end = code.indexOf("*/", i + 2);
      if (end < 0) return unterminated();
      i = end + 2;
    } else if (/^(\$@|@\$|\$|@)?"/.test(code.slice(i, i + 3))) {
      const start = i;
      const prefix = code.slice(i, code.indexOf('"', i));
      const verbatim = prefix.includes("@");
      const interpolated = prefix.includes("$");
      i += prefix.length + 1;
      let closed = false;
      while (i < code.length) {
        const s = code[i]!;
        if (s === '"') {
          if (verbatim && code[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        if (!verbatim && s === "\\") {
          i += 2;
          continue;
        }
        if (interpolated && s === "{") {
          if (code[i + 1] === "{") {
            i += 2;
            continue;
          }
          const hole = lex(code, i + 1, true);
          if (!hole.closed) return { tokens, open: false, end: code.length, closed: false, inner: hole.inner ?? hole };
          i = hole.end + 1;
          continue;
        }
        i++;
      }
      if (!closed) return unterminated();
      tokens.push({ kind: "string", text: code.slice(start, i), start, end: i });
    } else if (c === "'") {
      const start = i;
      i++;
      while (i < code.length && code[i] !== "'") i += code[i] === "\\" ? 2 : 1;
      if (i >= code.length) return unterminated();
      i++;
      tokens.push({ kind: "char", text: code.slice(start, i), start, end: i });
    } else if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < code.length && /\w/.test(code[i]!)) i++;
      tokens.push({ kind: "ident", text: code.slice(start, i), start, end: i });
    } else if (/\d/.test(c)) {
      const start = i;
      while (i < code.length && /[\w.]/.test(code[i]!)) i++;
      tokens.push({ kind: "number", text: code.slice(start, i), start, end: i });
    } else {
      if (nested && c === "{") depth++;
      if (nested && c === "}") {
        if (depth === 0) return { tokens, open: false, end: i, closed: true };
        depth--;
      }
      const text = code.startsWith("?.", i) ? "?." : code.startsWith("=>", i) ? "=>" : c;
      tokens.push({ kind: "punct", text, start: i, end: i + text.length });
      i += text.length;
    }
  }
  return { tokens, open: false, end: i, closed: false };
}

const isDot = (token: Token | undefined) => token?.text === "." || token?.text === "?.";
const PAIRS: Record<string, string> = { ")": "(", "]": "[", ">": "<", "}": "{" };

// Index of the bracket opening the one closing at `j`, or -1.
function matchBack(tokens: Token[], j: number): number {
  const close = tokens[j]!.text;
  const open = PAIRS[close]!;
  let depth = 0;
  for (; j >= 0; j--) {
    if (tokens[j]!.text === close) depth++;
    else if (tokens[j]!.text === open && --depth === 0) return j;
  }
  return -1;
}

// Index of the bracket closing the one opening at `j`, or tokens.length.
function matchForward(tokens: Token[], j: number): number {
  const open = tokens[j]!.text;
  const close = Object.keys(PAIRS).find((key) => PAIRS[key] === open)!;
  let depth = 0;
  for (; j < tokens.length; j++) {
    if (tokens[j]!.text === open) depth++;
    else if (tokens[j]!.text === close && --depth === 0) return j;
  }
  return tokens.length;
}

/** First token of the member-access chain whose last token is at `j`, or -1. */
function chainStart(tokens: Token[], j: number): number {
  while (j >= 0) {
    const token = tokens[j]!;
    if (token.text === ")") {
      j = matchBack(tokens, j);
      if (j < 0) return -1;
      if (tokens[j - 1]?.text === ">") j = matchBack(tokens, j - 1);
      if (j < 0) return -1;
      const callee = tokens[j - 1];
      if (callee?.kind !== "ident" || KEYWORDS.includes(callee.text)) return j;
      j--;
    } else if (token.text === "]") {
      j = matchBack(tokens, j) - 1;
      if (tokens[j]?.text === "?") j--;
      continue;
    } else if (token.kind !== "ident" && token.kind !== "string") {
      return -1;
    }
    if (isDot(tokens[j - 1])) j -= 2;
    else return tokens[j - 1]?.text === "new" ? j - 1 : j;
  }
  return -1;
}

/** Reads a type name such as `Newtonsoft.Json.Linq.JObject`, `string[]` or `List<int>` at `i`. */
function readType(tokens: Token[], i: number): { type: string; next: number } | null {
  if (tokens[i]?.kind !== "ident") return null;
  let name = tokens[i]!.text;
  i++;
  while (tokens[i]?.text === "." && tokens[i + 1]?.kind === "ident") {
    name = tokens[i + 1]!.text;
    i += 2;
  }
  let type = canonicalType(name);
  if (tokens[i]?.text === "<") {
    const close = matchForward(tokens, i);
    type += "<" + typeText(tokens.slice(i + 1, close)) + ">";
    i = close + 1;
  }
  while (tokens[i]?.text === "[" && tokens[i + 1]?.text === "]") {
    type += "[]";
    i += 2;
  }
  if (tokens[i]?.text === "?") {
    type += "?";
    i++;
  }
  return { type, next: i };
}

const typeText = (tokens: Token[]) =>
  tokens.map((token) => (token.text === "," ? ", " : token.kind === "ident" ? canonicalType(token.text) : token.text)).join("");

// Short names of the allowed .NET types, e.g. `JObject` -> `Newtonsoft.Json.Linq.JObject`.
const TYPE_NAMES = new Map<string, string>();
for (const qualified of ALLOWED_TYPES) {
  const short = qualified.split("<")[0]!.split(".").at(-1)!;
  if (short !== "Extensions" && !TYPE_NAMES.has(short)) TYPE_NAMES.set(short, qualified);
}
// Namespaces of the allowed types, e.g. `System`, `System.Net`.
const NAMESPACES = new Set(
  ALLOWED_TYPES.flatMap((qualified) => {
    const parts = qualified.split("<")[0]!.split(".").slice(0, -1);
    return parts.map((_, index) => parts.slice(0, index + 1).join("."));
  }),
);

// Namespaces and types directly inside namespace `name`, as members.
function namespaceMembers(name: string): Member[] {
  const members = new Map<string, Member>();
  for (const space of NAMESPACES) {
    const child = space.slice(name.length + 1);
    if (space.startsWith(`${name}.`) && !child.includes(".")) members.set(child, { name: child, kind: "property", type: `${space} (namespace)` });
  }
  for (const [short, qualified] of TYPE_NAMES) {
    if (qualified.split("<")[0] === `${name}.${short}`) members.set(short, { name: short, kind: "property", type: qualified });
  }
  return [...members.values()];
}

const isTypeName = (name: string) => TYPE_NAMES.has(name) || name in STATICS || name in TYPES || ["string", "int", "long", "double", "bool", "object", "var"].includes(name);

/** Local variables declared in `tokens`, with lazily evaluated types. */
class Scope {
  private declarations = new Map<string, () => Value | null>();
  private resolving = new Set<string>();

  private tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    for (let i = 0; i < tokens.length; i++) this.declareAt(i);
  }

  names(): string[] {
    return [...this.declarations.keys()];
  }

  typeOf(name: string): Value | null {
    const declaration = this.declarations.get(name);
    if (!declaration || this.resolving.has(name)) return null;
    this.resolving.add(name);
    try {
      return declaration();
    } finally {
      this.resolving.delete(name);
    }
  }

  private add(name: Token | undefined, value: () => Value | null) {
    if (name?.kind === "ident" && !KEYWORDS.includes(name.text)) this.declarations.set(name.text, value);
  }

  private declareAt(i: number) {
    const tokens = this.tokens;
    const token = tokens[i]!;
    // Lambda parameter: `.Any(g => g.`, `.Where((g) => g.`
    if (token.text === "=>") {
      const parenthesized = tokens[i - 1]?.text === ")" && tokens[i - 3]?.text === "(";
      const name = parenthesized ? tokens[i - 2] : tokens[i - 1];
      const open = parenthesized ? i - 4 : i - 2;
      if (tokens[open]?.text === "(" && tokens[open - 1]?.kind === "ident" && isDot(tokens[open - 2])) {
        const receiverEnd = open - 3;
        const start = chainStart(tokens, receiverEnd);
        this.add(name, () => elementOf(start < 0 ? null : evaluate(tokens, start, receiverEnd + 1, this)));
      }
      return;
    }
    if (token.kind !== "ident") return;
    // `out var x` / `out Jwt x` as an argument: typed by the called method's parameter.
    if (token.text === "out") {
      const declared = readType(tokens, i + 1);
      if (!declared || tokens[declared.next]?.kind !== "ident") return;
      const name = tokens[declared.next];
      if (declared.type !== "var") return this.add(name, () => ({ type: declared.type }));
      this.add(name, () => outParameterType(tokens, i, this));
      return;
    }
    // `foreach (var x in items)`
    if (token.text === "foreach" && tokens[i + 1]?.text === "(") {
      const declared = readType(tokens, i + 2);
      if (!declared || tokens[declared.next + 1]?.text !== "in") return;
      const name = tokens[declared.next];
      const close = matchForward(tokens, i + 1);
      const items = declared.next + 2;
      this.add(name, () => (declared.type === "var" ? elementOf(evaluateExpression(tokens, items, close, this)) : { type: declared.type }));
      return;
    }
    // `var x = ...;` / `JObject x = ...;`
    // (Not `out var`, `new JObject`, `as JObject` or `a.JObject`.)
    if (tokens[i - 1]?.kind === "ident" || isDot(tokens[i - 1]) || !isTypeName(token.text)) return;
    const declared = readType(tokens, i);
    const name = declared && tokens[declared.next];
    if (!declared || name?.kind !== "ident" || !["=", ";", ","].includes(tokens[declared.next + 1]?.text ?? "")) return;
    if (declared.type !== "var") return this.add(name, () => ({ type: declared.type }));
    const from = declared.next + 2;
    let to = from;
    for (let depth = 0; to < tokens.length; to++) {
      const text = tokens[to]!.text;
      if ("([{".includes(text)) depth++;
      else if (")]}".includes(text)) depth--;
      else if ((text === ";" || text === ",") && depth === 0) break;
      if (depth < 0) break;
    }
    this.add(name, () => evaluateExpression(tokens, from, to, this));
  }
}

// Type of `out var x` passed at `outIndex`, from the called method's `out` parameter.
function outParameterType(tokens: Token[], outIndex: number, scope: Scope): Value | null {
  let open = outIndex - 1;
  let argument = 0;
  for (let depth = 0; open >= 0; open--) {
    const text = tokens[open]!.text;
    if (text === ")" || text === "]") depth++;
    else if (text === "[") depth--;
    else if (text === "(" && depth-- === 0) break;
    else if (text === "," && depth === 0) argument++;
  }
  const member = memberAt(tokens, open - 1, scope);
  const parameter = member?.params?.split(",")[argument];
  const type = parameter?.match(/out\s+([\w.<>[\], ]+)/)?.[1]?.trim();
  return type ? { type } : null;
}

// The member named by the identifier at `j` in a chain like `a.b.Name`.
function memberAt(tokens: Token[], j: number, scope: Scope): Member | null {
  const name = tokens[j];
  if (name?.kind !== "ident" || !isDot(tokens[j - 1])) return null;
  const start = chainStart(tokens, j - 2);
  if (start < 0) return null;
  const receiver = evaluate(tokens, start, j - 1, scope);
  return receiver ? (membersOfValue(receiver).find((member) => member.name === name.text) ?? null) : null;
}

/** Element type of a collection value, e.g. `IEnumerable<IGroup>` -> `IGroup`. */
function elementOf(value: Value | null): Value | null {
  if (!value || value.static) return null;
  const first = membersOf(value.type).members.find((member) => member.name === "First");
  return first ? { type: first.type } : null;
}

function membersOfValue(value: Value): Member[] {
  if (value.namespace) return namespaceMembers(value.type);
  return value.static ? (STATICS[value.type]?.members ?? []) : membersOf(value.type).members;
}

/**
 * Type of the expression in `tokens[from..to)`: a chain, optionally with a
 * cast prefix, `as` suffix or `??` fallback.
 */
function evaluateExpression(tokens: Token[], from: number, to: number, scope: Scope): Value | null {
  for (let i = from, depth = 0; i < to; i++) {
    const text = tokens[i]!.text;
    if ("([{".includes(text)) depth++;
    else if (")]}".includes(text)) depth--;
    else if (depth === 0 && text === "?" && tokens[i + 1]?.text === "?") return evaluateExpression(tokens, from, i, scope);
    else if (depth === 0 && text === "as") return readTypeValue(tokens, i + 1);
    else if (depth === 0 && text === "?" && tokens[i + 1]?.text !== "[") {
      // Ternary: the type of whichever branch we understand.
      let colon = i + 1;
      for (let nested = 0; colon < to; colon++) {
        const inner = tokens[colon]!.text;
        if ("([{".includes(inner)) nested++;
        else if (")]}".includes(inner)) nested--;
        else if (inner === ":" && nested === 0) break;
      }
      return evaluateExpression(tokens, i + 1, colon, scope) ?? evaluateExpression(tokens, colon + 1, to, scope);
    }
  }
  if (tokens[from]?.text === "(") {
    const cast = readType(tokens, from + 1);
    if (cast && tokens[cast.next]?.text === ")" && cast.next + 1 < to && isTypeName(parseGeneric(cast.type).name.replace(/\[\]|\?/g, ""))) {
      return { type: cast.type };
    }
  }
  if (tokens[from]?.kind === "string" && tokens[from + 1]?.text === "+") return { type: "string" };
  return evaluate(tokens, from, to, scope);
}

function readTypeValue(tokens: Token[], i: number): Value | null {
  const type = readType(tokens, i);
  return type ? { type: type.type } : null;
}

/** Type of the member-access chain in `tokens[from..to)`, or null if it isn't one we understand. */
function evaluate(tokens: Token[], from: number, to: number, scope: Scope): Value | null {
  let i = from;
  let value: Value | null;
  const first = tokens[i]!;
  if (first.text === "new") {
    const created = readType(tokens, i + 1);
    if (!created) return null;
    // `new System.Text.` is still naming the type: evaluate the path on its own.
    if (tokens[created.next]?.text !== "(" && tokens[created.next]?.text !== "{") return evaluate(tokens, from + 1, to, scope);
    value = { type: created.type };
    i = created.next;
    if (tokens[i]?.text === "(" || tokens[i]?.text === "{") i = matchForward(tokens, i) + 1;
  } else if (first.text === "(") {
    const close = matchForward(tokens, i);
    value = evaluateExpression(tokens, i + 1, close, scope);
    i = close + 1;
  } else if (first.kind === "string") {
    value = { type: "string" };
    i++;
  } else if (first.kind === "ident") {
    const name = canonicalType(first.text);
    const local = scope.typeOf(first.text);
    if (first.text === "context") value = { type: "Context" };
    else if (local) value = local;
    else if (name in STATICS || TYPE_NAMES.has(name)) value = { type: name, static: true };
    else if (NAMESPACES.has(first.text)) value = { type: first.text, namespace: true };
    else value = null;
    i++;
  } else {
    return null;
  }

  while (value && i < to) {
    const token = tokens[i]!;
    if (token.text === "?" && tokens[i + 1]?.text === "[") {
      i++;
      continue;
    }
    if (isDot(token) && value.namespace) {
      // `System.Net.WebUtility`: walk namespaces down to a type.
      const name = tokens[i + 1];
      if (name?.kind !== "ident") return null;
      const qualified = `${value.type}.${name.text}`;
      if (NAMESPACES.has(qualified)) value = { type: qualified, namespace: true };
      else if (TYPE_NAMES.get(name.text)?.split("<")[0] === qualified) value = { type: name.text, static: true };
      else return null;
      i += 2;
      continue;
    }
    if (isDot(token)) {
      const name = tokens[i + 1];
      if (name?.kind !== "ident") return null;
      const member: Member | undefined = membersOfValue(value).find((candidate) => candidate.name === name.text);
      if (!member) return null;
      i += 2;
      let typeArgument = "object";
      if (tokens[i]?.text === "<") {
        const close = matchForward(tokens, i);
        typeArgument = typeText(tokens.slice(i + 1, close));
        i = close + 1;
      }
      if (tokens[i]?.text === "(") i = matchForward(tokens, i) + 1;
      value = { type: member.type.replace(/\bT\b/g, typeArgument) };
    } else if (token.text === "[") {
      const indexer = value.static ? undefined : membersOf(value.type).indexer;
      value = indexer ? { type: indexer } : null;
      i = matchForward(tokens, i) + 1;
    } else {
      return null;
    }
  }
  return value;
}

export type ExpressionCompletion =
  /** After `x.`; `start` is where the member name being typed begins (offset in the code). */
  | { kind: "members"; members: Member[]; start: number }
  /** Start of an identifier: locals, `context`, types and keywords. */
  | { kind: "identifiers"; locals: string[]; types: Map<string, string>; start: number }
  /** A type is expected: type arguments, `new`, `as`, `is`. */
  | { kind: "types"; types: Map<string, string>; start: number }
  | { kind: "none" };

/** What can be completed at the end of `code`, the expression text before the cursor. */
export function completeAt(code: string): ExpressionCompletion {
  const { tokens, open } = lexToEnd(code);
  if (open) return { kind: "none" };
  let end = tokens.length;
  let start = code.length;
  const last = tokens[end - 1];
  if (last && last.end === code.length && (last.kind === "ident" || last.kind === "number")) {
    if (last.kind === "number") return { kind: "none" };
    end--;
    start = last.start;
  }
  const previous = tokens[end - 1];
  const scope = new Scope(tokens.slice(0, end));
  if (isDot(previous)) {
    const receiverStart = chainStart(tokens, end - 2);
    const receiver = receiverStart < 0 ? null : evaluate(tokens, receiverStart, end - 1, scope);
    return receiver ? { kind: "members", members: membersOfValue(receiver), start } : { kind: "none" };
  }
  // Type argument of a generic method (`.As<`) or type (`List<`), not a comparison.
  if (previous?.text === "<") {
    const generic = tokens[end - 2];
    const genericType = generic && TYPE_NAMES.get(generic.text)?.includes("<");
    if (genericType || memberAt(tokens, end - 2, scope)?.typeArgs) return { kind: "types", types: TYPE_NAMES, start };
  }
  if (previous?.kind === "ident" && ["new", "as", "is"].includes(previous.text)) return { kind: "types", types: TYPE_NAMES, start };
  // An identifier right after a type or name is a declaration: nothing to offer.
  if (previous?.kind === "ident" && !["return", "in", "else", "case", "throw", "out", "await"].includes(previous.text)) return { kind: "none" };
  return { kind: "identifiers", locals: scope.names(), types: TYPE_NAMES, start };
}

export type ExpressionHover = { signature: string; doc?: string };

/** Hover for the identifier that ends at the end of `code`. */
export function hoverAt(code: string): ExpressionHover | null {
  const { tokens, open } = lexToEnd(code);
  const name = tokens.at(-1);
  if (open || name?.kind !== "ident" || name.end !== code.length) return null;
  const scope = new Scope(tokens);
  const j = tokens.length - 1;
  if (isDot(tokens[j - 1])) {
    const start = chainStart(tokens, j - 2);
    const receiver = start < 0 ? null : evaluate(tokens, start, j - 1, scope);
    const member = receiver && membersOfValue(receiver).find((candidate) => candidate.name === name.text);
    if (!receiver || !member) return null;
    const owner = receiver.type;
    const signature =
      member.kind === "property"
        ? `${member.type} ${owner}.${member.name}`
        : `${member.type} ${owner}.${member.name}${member.typeArgs ? "<T>" : ""}(${member.params ?? ""})`;
    return { signature, ...(member.doc && { doc: member.doc }) };
  }
  if (name.text === "context") return { signature: "Context context", doc: "The policy expression context, implicitly available in every expression." };
  const local = scope.typeOf(name.text);
  if (local) return { signature: `${local.type} ${name.text}` };
  const qualified = TYPE_NAMES.get(canonicalType(name.text));
  return qualified ? { signature: qualified, doc: "Allowed in policy expressions." } : null;
}

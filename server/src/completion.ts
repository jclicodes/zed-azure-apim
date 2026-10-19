// Completion items for a position in a policy document.

import {
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  type CompletionItem,
  type Range,
} from "vscode-languageserver";
import { analyze, type Cursor } from "./document.ts";
import { completeAt } from "./csharp.ts";
import { KEYWORDS, type Member } from "./csharp-model.ts";
import { childNamed, childrenOf, scopeAt, type Attribute, type Child, type ElementSpec } from "./schema.ts";
import { TEMPLATES, VARIANTS } from "./templates.ts";

export type CompletionRequest = {
  text: string;
  offset: number;
  /** Character that triggered the request, if any. */
  trigger?: string;
  /** Named values known in the workspace. */
  namedValues: Iterable<string>;
  /** Converts a text range to an LSP range. */
  toRange: (start: number, end: number) => Range;
};

// Trigger characters only make sense in certain places; elsewhere (e.g. a
// space in element text) they'd pop up noise.
const TRIGGER_CONTEXTS: Record<string, Cursor["kind"][]> = {
  "<": ["tag-name", "expression"],
  "/": ["end-tag"],
  " ": ["attribute-name"],
  '"': ["attribute-value"],
  "'": ["attribute-value"],
  ".": ["expression"],
  "{": ["named-value"],
};

export function complete(request: CompletionRequest): CompletionItem[] {
  const { text, offset, trigger } = request;
  const cursor = analyze(text, offset);
  if (trigger && !TRIGGER_CONTEXTS[trigger]?.includes(cursor.kind)) return [];
  const range = (start: number, end: number) => request.toRange(start, end);
  switch (cursor.kind) {
    case "tag-name":
      return childrenOf(scopeAt(cursor.stack)).flatMap((child) => elementItems(child, range(cursor.start, cursor.end), ""));
    case "text": {
      // Typing a policy name straight into a section: insert it with its `<`.
      const scope = scopeAt(cursor.stack);
      if (scope.kind !== "policy-list" && scope.kind !== "policies" && scope.kind !== "root") return [];
      return childrenOf(scope).flatMap((child) => elementItems(child, range(cursor.start, cursor.end), "<"));
    }
    case "end-tag": {
      const open = cursor.stack.at(-1);
      if (!open) return [];
      const closing = text[cursor.end] === ">" ? open : `${open}>`;
      return [{ label: open, kind: CompletionItemKind.Struct, textEdit: { range: range(cursor.start, cursor.end), newText: closing } }];
    }
    case "attribute-name": {
      const element = childNamed(scopeAt(cursor.stack), cursor.tag)?.spec;
      if (!element) return [];
      return element.attributes
        .filter((attribute) => !cursor.present.includes(attribute.name))
        .map((attribute) => attributeItem(attribute, range(cursor.start, cursor.end)));
    }
    case "attribute-value": {
      const element = childNamed(scopeAt(cursor.stack), cursor.tag)?.spec;
      const attribute = element?.attributes.find((candidate) => candidate.name === cursor.attribute);
      if (!attribute) return [];
      return valueItems(attribute, range(cursor.start, cursor.end));
    }
    case "named-value":
      return namedValueItems(request.namedValues, range(cursor.start, cursor.end), cursor.closed);
    case "expression":
      return expressionItems(request, cursor);
    case "none":
      return [];
  }
}

const markdown = (value: string) => ({ kind: MarkupKind.Markdown, value });

function elementDocumentation(child: Child): string {
  const { spec, policy } = child;
  const lines = [policy?.description ?? spec.description ?? ""];
  if (policy?.sections.length) lines.push(`**Sections:** ${policy.sections.join(", ")}`);
  const required = spec.attributes.filter((attribute) => attribute.required).map((attribute) => `\`${attribute.name}\``);
  if (required.length) lines.push(`**Required attributes:** ${required.join(", ")}`);
  if (policy?.docUrl) lines.push(`[Policy reference](${policy.docUrl})`);
  return lines.filter(Boolean).join("\n\n");
}

function elementItems(child: Child, range: Range, prefix: string): CompletionItem[] {
  const name = child.spec.name;
  const documentation = markdown(elementDocumentation(child));
  const kind = child.policy ? CompletionItemKind.Function : CompletionItemKind.Struct;
  const item = (label: string, body: string, sortText: string): CompletionItem => ({
    label,
    kind,
    documentation,
    filterText: name,
    sortText,
    insertTextFormat: InsertTextFormat.Snippet,
    textEdit: { range, newText: prefix + body },
  });
  return [
    item(name, TEMPLATES[name] ?? elementSnippet(child.spec), name),
    ...VARIANTS.filter((variant) => variant.name === name).map((variant) => ({
      ...item(variant.label, variant.body, `${name} ${variant.label}`),
      documentation: markdown(variant.description),
    })),
  ];
}

const escapeChoice = (value: string) => value.replace(/[\\,|$}]/g, (c) => `\\${c}`);

// Value placeholder for tab stop `stop`: a choice list if the values are known.
function valuePlaceholder(attribute: Attribute, stop: number): string {
  const values = knownValues(attribute);
  if (attribute.name === "condition") return `@($${stop})`;
  if (values.length) return `\${${stop}|${values.map(escapeChoice).join(",")}|}`;
  return `$${stop}`;
}

// Documented values, with the default first.
function knownValues(attribute: Attribute): string[] {
  const values = attribute.values.length ? attribute.values : attribute.default === "true" || attribute.default === "false" ? ["true", "false"] : [];
  const fallback = attribute.default;
  return fallback !== null && values.includes(fallback) ? [fallback, ...values.filter((value) => value !== fallback)] : values;
}

/** Insert text for an element: required attributes and required children as tab stops. */
export function elementSnippet(spec: ElementSpec): string {
  let stop = 1;
  const render = (element: ElementSpec, indent: string): string => {
    const attributes = element.attributes
      .filter((attribute) => attribute.required)
      .map((attribute) => ` ${attribute.name}="${valuePlaceholder(attribute, stop++)}"`)
      .join("");
    const open = `${element.name}${attributes}`;
    const children = element.children.filter((child) => child.required);
    if (element.selfClosing) return `${open} />`;
    if (!children.length && !element.children.length && !POLICY_LIKE.has(element.name)) return `${open}>$${stop++}</${element.name}>`;
    const inner = `${indent}    `;
    const body = children.map((child) => `${inner}<${render(child, inner)}`).join("\n");
    return `${open}>\n${body || `${inner}$${stop++}`}\n${indent}</${element.name}>`;
  };
  return render(spec, "").replace(/\$(\d+)(?![\s\S]*\$\d)/, "$0");
}

// Containers whose bodies are policies, laid out on their own lines.
const POLICY_LIKE = new Set(["policies", "fragment", "inbound", "backend", "outbound", "on-error", "when", "otherwise"]);

function attributeItem(attribute: Attribute, range: Range): CompletionItem {
  const details = [attribute.description];
  if (attribute.default !== null) details.push(`**Default:** \`${attribute.default}\``);
  if (attribute.values.length) details.push(`**Values:** ${attribute.values.map((value) => `\`${value}\``).join(", ")}`);
  if (attribute.expressions) details.push("Policy expressions are allowed.");
  return {
    label: attribute.name,
    kind: CompletionItemKind.Property,
    ...(attribute.required && { detail: "required" }),
    documentation: markdown(details.filter(Boolean).join("\n\n")),
    sortText: `${attribute.required ? 0 : 1}${attribute.name}`,
    insertTextFormat: InsertTextFormat.Snippet,
    textEdit: { range, newText: `${attribute.name}="${valuePlaceholder(attribute, 1)}"$0` },
  };
}

function valueItems(attribute: Attribute, range: Range): CompletionItem[] {
  const items: CompletionItem[] = knownValues(attribute).map((value, index) => ({
    label: value,
    kind: CompletionItemKind.EnumMember,
    ...(value === attribute.default && { detail: "default" }),
    sortText: String(index).padStart(3, "0"),
    textEdit: { range, newText: value },
  }));
  if (attribute.expressions) {
    items.push(
      { label: "@(expression)", kind: CompletionItemKind.Snippet, sortText: "z1", insertTextFormat: InsertTextFormat.Snippet, textEdit: { range, newText: "@($1)" } },
      { label: "@{statements}", kind: CompletionItemKind.Snippet, sortText: "z2", insertTextFormat: InsertTextFormat.Snippet, textEdit: { range, newText: "@{\n    return $1;\n}" } },
    );
  }
  return items;
}

function namedValueItems(names: Iterable<string>, range: Range, closed: boolean): CompletionItem[] {
  return [...new Set(names)].sort().map((name) => ({
    label: name,
    kind: CompletionItemKind.Constant,
    detail: "named value",
    textEdit: { range, newText: closed ? name : `${name}}}` },
  }));
}

function expressionItems(request: CompletionRequest, cursor: Cursor & { kind: "expression" }): CompletionItem[] {
  const { text, offset } = request;
  // Named values are substituted before the expression is evaluated, so `{{x}}` works in C# strings too.
  const namedValue = cursor.code.match(/\{\{([^{}\s"]*)$/);
  if (namedValue) {
    const start = offset - namedValue[1]!.length;
    let end = offset;
    while (end < text.length && /[^{}"\s]/.test(text[end]!)) end++;
    return namedValueItems(request.namedValues, request.toRange(start, end), text.startsWith("}}", end));
  }
  const completion = completeAt(cursor.code);
  if (completion.kind === "none") return [];
  let end = offset;
  while (end < text.length && /\w/.test(text[end]!)) end++;
  const range = request.toRange(cursor.codeStart + completion.start, end);
  if (request.trigger === "<" && completion.kind !== "types") return [];
  switch (completion.kind) {
    case "members":
      return completion.members.map((member) => memberItem(member, range));
    case "types":
      return [...["string", "int", "bool", "double", "long", "object", "byte[]"], ...completion.types.keys()].map((name) => typeItem(name, completion.types.get(name), range));
    case "identifiers":
      return [
        { label: "context", kind: CompletionItemKind.Variable, detail: "Context", documentation: "The policy expression context.", sortText: "0", textEdit: { range, newText: "context" } },
        ...completion.locals.map((name) => ({ label: name, kind: CompletionItemKind.Variable, sortText: `1${name}`, textEdit: { range, newText: name } })),
        ...KEYWORDS.map((name) => ({ label: name, kind: CompletionItemKind.Keyword, sortText: `3${name}`, textEdit: { range, newText: name } })),
        ...[...completion.types].map(([name, qualified]) => ({ ...typeItem(name, qualified, range), sortText: `2${name}` })),
      ];
  }
}

function typeItem(name: string, qualified: string | undefined, range: Range): CompletionItem {
  return { label: name, kind: CompletionItemKind.Class, ...(qualified && { detail: qualified }), textEdit: { range, newText: name } };
}

function memberItem(member: Member, range: Range): CompletionItem {
  const signature = member.kind === "method" ? `(${member.params ?? ""}): ${member.type}` : member.type;
  return {
    label: member.name,
    kind: member.kind === "method" ? CompletionItemKind.Method : CompletionItemKind.Property,
    detail: signature,
    ...(member.doc && { documentation: member.doc }),
    insertTextFormat: InsertTextFormat.Snippet,
    textEdit: { range, newText: memberSnippet(member) },
  };
}

function memberSnippet(member: Member): string {
  if (member.kind === "property") return member.name;
  const typeArgs = member.typeArgs ? `<\${1|${member.typeArgs.map(escapeChoice).join(",")}|}>` : "";
  const args = member.args ?? (member.params ? "$1" : "");
  return `${member.name}${typeArgs}(${args})$0`;
}

// The APIM policy document model: which elements may appear where, and their
// attributes. Policy data comes from data/apim-schema.json (extracted from the
// Microsoft Learn policy reference by scripts/extract_schema.py); the
// document structure around policies is defined here.

import data from "../../data/apim-schema.json" with { type: "json" };

export type Section = "inbound" | "backend" | "outbound" | "on-error";

export type Attribute = {
  name: string;
  description: string;
  required: boolean;
  values: string[];
  default: string | null;
  /** Whether policy expressions are allowed in the value. */
  expressions: boolean;
};

export type ElementSpec = {
  name: string;
  description?: string;
  required: boolean;
  attributes: Attribute[];
  children: ElementSpec[];
  selfClosing: boolean;
};

export type Policy = {
  name: string;
  description: string;
  docUrl: string;
  sections: Section[];
  element: ElementSpec;
};

export const POLICIES = data.policies as Policy[];
const POLICY_BY_NAME = new Map(POLICIES.map((policy) => [policy.name, policy]));

export const SECTIONS: Section[] = ["inbound", "backend", "outbound", "on-error"];

const structural = (name: string, description: string, selfClosing = false): ElementSpec => ({
  name,
  description,
  required: false,
  attributes: [],
  children: [],
  selfClosing,
});

const SECTION_DESCRIPTIONS: Record<Section, string> = {
  inbound: "Runs on the incoming request.",
  backend: "Runs before the request is forwarded to the backend.",
  outbound: "Runs on the response.",
  "on-error": "Runs when an error is raised in any other section.",
};

const POLICIES_ELEMENT = structural("policies", "Policy document root, containing the four policy sections.");
const FRAGMENT_ELEMENT = structural("fragment", "Policy fragment root. Fragments are included in policies with include-fragment.");
const BASE_ELEMENT = structural("base", "Runs the policies from the enclosing scope (e.g. product or global) at this point.", true);
const SECTION_ELEMENTS = SECTIONS.map((section) => structural(section, SECTION_DESCRIPTIONS[section]));

// Policies and choose branches whose children are policies.
const POLICY_CONTAINERS = new Set(["when", "otherwise", "retry", "wait", "limit-concurrency"]);

/** A position in the policy document tree. */
export type Scope =
  | { kind: "root" }
  | { kind: "policies" }
  /** Children are policies valid in `section` (any section if null, as in fragments). */
  | { kind: "policy-list"; section: Section | null; base: boolean }
  | { kind: "element"; spec: ElementSpec; section: Section | null }
  | { kind: "unknown" };

/** An element that may appear in a scope, with its policy if it is one. */
export type Child = { spec: ElementSpec; policy?: Policy };

/** Elements allowed directly inside `scope`. */
export function childrenOf(scope: Scope): Child[] {
  switch (scope.kind) {
    case "root":
      return [{ spec: POLICIES_ELEMENT }, { spec: FRAGMENT_ELEMENT }, ...RESOLVER_POLICIES.map((policy) => ({ spec: policy.element, policy }))];
    case "policies":
      return SECTION_ELEMENTS.map((spec) => ({ spec }));
    case "policy-list": {
      const policies = POLICIES.filter((policy) => scope.section === null || policy.sections.includes(scope.section));
      return [...(scope.base ? [{ spec: BASE_ELEMENT }] : []), ...policies.map((policy) => ({ spec: policy.element, policy }))];
    }
    case "element":
      return scope.spec.children.map(withPolicy);
    case "unknown":
      return [];
  }
}

// GraphQL resolver policies have no section: they are the document root.
const RESOLVER_POLICIES = POLICIES.filter((policy) => policy.sections.length === 0);

// A policy nested in another (e.g. set-header in send-request) is documented
// there with only the attributes its example uses; fill in the rest from the
// policy itself.
function withPolicy(spec: ElementSpec): Child {
  const policy = POLICY_BY_NAME.get(spec.name);
  if (!policy || policy.element === spec) return { spec };
  const attributes = [...policy.element.attributes];
  for (const attribute of spec.attributes) {
    if (!attributes.some((known) => known.name === attribute.name)) attributes.push(attribute);
  }
  const children = [...policy.element.children];
  for (const child of spec.children) {
    if (!children.some((known) => known.name === child.name)) children.push(child);
  }
  return { spec: { ...policy.element, required: spec.required, attributes, children }, policy };
}

/** The scope inside element `name` placed in `scope`. */
export function enter(scope: Scope, name: string): Scope {
  if (scope.kind === "root") {
    if (name === "policies") return { kind: "policies" };
    if (name === "fragment") return { kind: "policy-list", section: null, base: false };
  }
  if (scope.kind === "policies" && (SECTIONS as string[]).includes(name)) {
    return { kind: "policy-list", section: name as Section, base: true };
  }
  const child = childrenOf(scope).find((candidate) => candidate.spec.name === name);
  if (!child) return { kind: "unknown" };
  const section = scope.kind === "policy-list" || scope.kind === "element" ? scope.section : null;
  if (POLICY_CONTAINERS.has(name)) return { kind: "policy-list", section, base: false };
  return { kind: "element", spec: child.spec, section };
}

/** Scope inside the innermost of the open elements `stack` (outermost first). */
export const scopeAt = (stack: string[]): Scope => stack.reduce(enter, { kind: "root" } as Scope);

/** The element `name` as allowed in `scope`, if it is. */
export const childNamed = (scope: Scope, name: string): Child | undefined =>
  childrenOf(scope).find((child) => child.spec.name === name);

export const policyNamed = (name: string) => POLICY_BY_NAME.get(name);

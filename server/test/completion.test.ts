// Policy-structure completion against the real schema: the right elements in
// the right places, and attributes/values from the policy reference.

import assert from "node:assert/strict";
import { test } from "node:test";
import { elementSnippet } from "../src/completion.ts";
import { policyNamed } from "../src/schema.ts";
import { items, labels } from "./helpers.ts";

test("sections only offer policies allowed there", () => {
  const inbound = labels("<policies><inbound>\n<▮");
  assert.ok(inbound.includes("base"));
  assert.ok(inbound.includes("rate-limit-by-key"));
  assert.ok(!inbound.includes("forward-request"), "forward-request is backend-only");

  const backend = labels("<policies><backend>\n<▮");
  assert.ok(backend.includes("forward-request"));
  assert.ok(!backend.includes("rate-limit-by-key"), "rate-limit-by-key is inbound-only");
});

test("choose branches offer the enclosing section's policies, without base", () => {
  const when = labels('<policies><backend><choose><when condition="@(true)"><▮');
  assert.ok(when.includes("forward-request"));
  assert.ok(!when.includes("base"));
  assert.deepEqual(labels("<policies><backend><choose><▮"), ["when", "otherwise"]);
});

test("document roots and section names", () => {
  assert.ok(labels("<▮").includes("policies"));
  assert.ok(labels("<▮").includes("fragment"));
  assert.deepEqual(labels("<policies><▮"), ["inbound", "backend", "outbound", "on-error"]);
});

test("fragments allow policies from any section", () => {
  const fragment = labels("<fragment><▮");
  assert.ok(fragment.includes("forward-request") && fragment.includes("rate-limit-by-key"));
});

test("child elements of a policy, with nested policies documented fully", () => {
  const children = labels('<policies><inbound><send-request response-variable-name="r"><▮');
  assert.ok(children.includes("set-url") && children.includes("set-header"));
  const attributes = labels('<policies><inbound><send-request response-variable-name="r"><set-header ▮');
  assert.ok(attributes.includes("exists-action"), "set-header inside send-request gets set-header's attributes");
});

test("element completion inserts the template, without repeating the typed <", () => {
  const [setHeader] = items("<policies><inbound><set-h▮").filter((item) => item.label === "set-header");
  assert.ok(setHeader?.textEdit && "range" in setHeader.textEdit);
  assert.match(setHeader.textEdit.newText, /^set-header name="\$1" exists-action="\$\{2\|override,skip,append,delete\|\}">/);
});

test("typing a policy name in a section, without <, inserts the <", () => {
  const [item] = items("<policies><inbound>\n    set-he▮").filter((candidate) => candidate.label === "set-header");
  assert.ok(item?.textEdit && "range" in item.textEdit);
  assert.ok(item.textEdit.newText.startsWith("<set-header "));
  assert.equal(item.filterText, "set-header", "filtered against the typed word, which has no <");
  assert.deepEqual(labels("<policies><inbound><set-header name=\"a\"><value>tok▮"), [], "nothing in text content");
});

test("attributes: missing ones only, required first", () => {
  const result = items('<policies><inbound><rate-limit-by-key calls="5" ▮');
  const names = result.map((item) => item.label);
  assert.ok(!names.includes("calls"));
  const required = result.filter((item) => item.detail === "required").map((item) => item.label);
  assert.deepEqual(required.sort(), ["counter-key", "renewal-period"]);
});

test("attribute values: documented choices, default first, plus expressions where allowed", () => {
  assert.deepEqual(labels('<policies><inbound><set-header name="a" exists-action="▮">'), [
    "override",
    "skip",
    "append",
    "delete",
    "@(expression)",
    "@{statements}",
  ]);
});

test("closing tag completes the innermost open element", () => {
  const [item] = items("<policies><inbound><choose></▮");
  assert.equal(item?.label, "choose");
  assert.ok(item?.textEdit && "range" in item.textEdit && item.textEdit.newText === "choose>");
});

test("named values from the workspace, closing the braces when needed", () => {
  const [open] = items('<set-variable name="a" value="{{po▮" />', { namedValues: ["pool-config"] });
  assert.ok(open?.textEdit && "range" in open.textEdit && open.textEdit.newText === "pool-config}}");
  const [closed] = items('<set-variable name="a" value="{{po▮}}" />', { namedValues: ["pool-config"] });
  assert.ok(closed?.textEdit && "range" in closed.textEdit && closed.textEdit.newText === "pool-config");
});

test("trigger characters only fire where they mean something", () => {
  assert.deepEqual(labels("<policies><inbound><set-header name=\"a\"><value>a ▮", { trigger: " " }), []);
  assert.ok(labels('<policies><inbound><set-header ▮', { trigger: " " }).includes("name"));
});

test("generated snippet: required attributes and children as tab stops", () => {
  const policy = policyNamed("cache-remove-value")!;
  assert.equal(elementSnippet(policy.element), 'cache-remove-value key="$0" />');
  const check = policyNamed("check-header")!.element;
  assert.match(elementSnippet(check), /^check-header name="\$1" failed-check-httpcode="\$2"/);
});

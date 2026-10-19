// The cursor classifier must cope with APIM's non-XML expressions and with
// half-typed documents, since that's when completion is asked for.

import assert from "node:assert/strict";
import { test } from "node:test";
import { analyze } from "../src/document.ts";
import { at } from "./helpers.ts";

const classify = (source: string) => {
  const { text, offset } = at(source);
  return analyze(text, offset);
};

test("element name being typed, with the open elements around it", () => {
  const cursor = classify("<policies>\n  <inbound>\n    <base />\n    <set-h▮");
  assert.equal(cursor.kind, "tag-name");
  assert.deepEqual(cursor.kind === "tag-name" && cursor.stack, ["policies", "inbound"]);
});

test("expressions containing quotes, > and ) don't break element tracking", () => {
  const cursor = classify(
    '<policies><outbound><choose><when condition="@(context.Response.StatusCode > 400 && context.Request.Headers.GetValueOrDefault("x", ")") != "<")"><set-▮',
  );
  assert.equal(cursor.kind, "tag-name");
  assert.deepEqual(cursor.kind === "tag-name" && cursor.stack, ["policies", "outbound", "choose", "when"]);
});

test("closed and self-closing elements and comments don't stay open", () => {
  const cursor = classify("<policies><inbound><!-- <outbound> --><set-header name=\"a\"><value>x</value></set-header><base /></inbound><▮");
  assert.deepEqual(cursor.kind === "tag-name" && cursor.stack, ["policies"]);
});

test("attribute position lists attributes already present, including after the cursor", () => {
  const cursor = classify('<set-header name="x" ▮ exists-action="skip">');
  assert.equal(cursor.kind, "attribute-name");
  assert.deepEqual(cursor.kind === "attribute-name" && cursor.present, ["name", "exists-action"]);
});

test("no attribute completion directly after a value", () => {
  assert.equal(classify('<set-header name="x"▮>').kind, "none");
});

test("cursor in an attribute's expression gives the code before it", () => {
  const cursor = classify('<set-variable name="a" value="@(context.Request.Headers.GetValueOrDefault("Authorization", "(").AsJwt()?.▮)" />');
  assert.equal(cursor.kind, "expression");
  assert.equal(cursor.kind === "expression" && cursor.code, 'context.Request.Headers.GetValueOrDefault("Authorization", "(").AsJwt()?.');
  assert.equal(cursor.kind === "expression" && cursor.attribute, "value");
});

test("cursor in a statement block in element content", () => {
  const cursor = classify('<set-body>@{\n  var body = context.Request.Body.As<JObject>();\n  if (body["a"] != null) { return "}"; }\n  return body.▮\n}</set-body>');
  assert.equal(cursor.kind, "expression");
  assert.match(cursor.kind === "expression" ? cursor.code : "", /return body\.$/);
});

test("literal attribute value and named value reference", () => {
  const value = classify('<set-header name="x" exists-action="ov▮erride">');
  assert.equal(value.kind, "attribute-value");
  assert.equal(value.kind === "attribute-value" && value.attribute, "exists-action");

  const named = classify('<set-variable name="x" value="https://{{backend-h▮}}/api" />');
  assert.equal(named.kind, "named-value");
  assert.equal(named.kind === "named-value" && named.closed, true);
});

test("closing tag", () => {
  const cursor = classify("<policies><inbound></▮");
  assert.equal(cursor.kind, "end-tag");
  assert.deepEqual(cursor.kind === "end-tag" && cursor.stack, ["policies", "inbound"]);
});

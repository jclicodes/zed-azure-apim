// Member completion in policy expressions: chains are typed through the APIM
// context model, locals, lambdas, casts and generic calls.

import assert from "node:assert/strict";
import { test } from "node:test";
import { completeAt } from "../src/csharp.ts";
import { hover } from "../src/hover.ts";
import { at, items } from "./helpers.ts";

const members = (code: string) => {
  const result = completeAt(code);
  return result.kind === "members" ? result.members.map((member) => member.name) : [];
};

test("context members", () => {
  assert.ok(members("context.").includes("Request"));
  assert.ok(members("context.Request.").includes("Headers"));
  assert.ok(members("context.Request.Url.").includes("QueryString"));
});

test("method results flow through the chain", () => {
  assert.deepEqual(members('context.Request.Headers.GetValueOrDefault("Authorization", "").AsJwt()?.Claims.').slice(0, 1), ["GetValueOrDefault"]);
  assert.ok(members('context.Request.Headers.GetValueOrDefault("Authorization","").').includes("AsJwt"));
});

test("generic type arguments decide the result type", () => {
  assert.ok(members("context.Request.Body.As<JObject>(preserveContent: true).").includes("SelectToken"));
  assert.ok(members("context.Variables.GetValueOrDefault<string>(\"x\").").includes("StartsWith"));
});

test("indexers, casts and ?? fallbacks", () => {
  assert.ok(members('context.Request.Headers["x"].').includes("FirstOrDefault"));
  assert.ok(members('((string)context.Variables["x"]).').includes("Split"));
  assert.ok(members('var s = (string)context.Variables["x"] ?? ""; return s.').includes("Split"));
});

test("locals: var, out var, foreach and lambda parameters", () => {
  assert.ok(members('var jwt = context.Request.Headers.GetValueOrDefault("a", "").AsJwt(); return jwt.').includes("Claims"));
  assert.ok(members('var h = context.Request.Headers.GetValueOrDefault("a", ""); if (h.TryParseJwt(out var token)) { return token.').includes("Subject"));
  assert.ok(members("foreach (var group in context.User.Groups) { group.").includes("Name"));
  assert.ok(members('context.User.Groups.Any(g => g.').includes("Name"));
});

test("static members of allowed types", () => {
  assert.ok(members("DateTime.").includes("UtcNow"));
  assert.ok(members("DateTime.UtcNow.").includes("AddMinutes"));
  assert.ok(members("string.").includes("IsNullOrEmpty"));
});

test("cursor inside an interpolated string's hole", () => {
  assert.ok(members('$"{context.Api.').includes("Version"));
});

test("nothing inside string literals or after numbers", () => {
  assert.equal(completeAt('"context.').kind, "none");
  assert.equal(completeAt("1.").kind, "none");
});

test("identifier positions offer context, locals and allowed types", () => {
  const result = completeAt('var body = 1; return bo');
  assert.equal(result.kind, "identifiers");
  assert.ok(result.kind === "identifiers" && result.locals.includes("body"));
  assert.ok(result.kind === "identifiers" && result.types.has("JObject"));
  assert.equal(completeAt("var na").kind, "none", "naming a new variable");
});

test("type argument position offers types", () => {
  assert.equal(completeAt("context.Request.Body.As<").kind, "types");
  assert.notEqual(completeAt("context.Response.StatusCode <").kind, "types");
});

test("member completion inside a document replaces just the member name", () => {
  const [item] = items('<set-variable name="a" value="@(context.Request.Head▮)" />').filter((candidate) => candidate.label === "Headers");
  assert.ok(item?.textEdit && "range" in item.textEdit);
  assert.equal(item.textEdit.range.start.character, '<set-variable name="a" value="@(context.Request.'.length);
});

test("hover on expression members, policies and attributes", () => {
  const member = at('<set-variable name="a" value="@(context.Request.Hea▮ders)" />');
  assert.match(hover(member.text, member.offset) ?? "", /HeaderDictionary Request\.Headers/);
  const policy = at("<policies><inbound><rate-li▮mit-by-key /></inbound></policies>");
  assert.match(hover(policy.text, policy.offset) ?? "", /\*\*rate-limit-by-key\*\* policy/);
  const attribute = at('<policies><inbound><set-header na▮me="x" /></inbound></policies>');
  assert.match(hover(attribute.text, attribute.offset) ?? "", /\*\*name\*\* \(required\)/);
});

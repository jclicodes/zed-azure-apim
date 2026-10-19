// Drives the shipped bundle over stdio like an editor would, so bundling
// (including the embedded schema) and the LSP wiring are covered.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { CompletionItem, Hover, InitializeResult, MarkupContent } from "vscode-languageserver";

const BUNDLE = fileURLToPath(new URL("../bundle/apim-language-server.cjs", import.meta.url));

// Minimal LSP client: Content-Length framed JSON-RPC over the child's stdio.
function startServer() {
  const child = spawn(process.execPath, [BUNDLE, "--stdio"], { stdio: ["pipe", "pipe", "inherit"] });
  const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
  child.on("exit", (code) => pending.forEach(({ reject }) => reject(new Error(`server exited with ${code}`))));
  let buffer = Buffer.alloc(0);
  child.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, headerEnd).toString())![1]);
      if (buffer.length < headerEnd + 4 + length) return;
      const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString());
      buffer = buffer.subarray(headerEnd + 4 + length);
      if (message.id !== undefined && pending.has(message.id)) pending.get(message.id)!.resolve(message.result);
    }
  });
  const send = (message: object) => {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message });
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  };
  let nextId = 1;
  return {
    request: <Result>(method: string, params: object) =>
      new Promise<Result>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve: (result) => resolve(result as Result), reject });
        send({ id, method, params });
      }),
    notify: (method: string, params: object) => send({ method, params }),
    stop: () => child.kill(),
  };
}

test("completion and hover round-trip through the bundled server", async () => {
  const server = startServer();
  try {
    const initialized = await server.request<InitializeResult>("initialize", { processId: null, rootUri: null, capabilities: {} });
    assert.ok(initialized.capabilities.completionProvider?.triggerCharacters?.includes("."));
    server.notify("initialized", {});

    const uri = "file:///tmp/test.policy.xml";
    const text = '<policies>\n  <inbound>\n    <set-header name="x" exists-action="override">\n      <value>@(context.Request.)</value>\n    </set-header>\n    <\n';
    server.notify("textDocument/didOpen", { textDocument: { uri, languageId: "apim", version: 1, text } });

    // After `context.Request.` on line 3 (UTF-16 columns).
    const memberColumn = "      <value>@(context.Request.".length;
    const members = await server.request<CompletionItem[]>("textDocument/completion", { textDocument: { uri }, position: { line: 3, character: memberColumn } });
    assert.ok(members.some((item) => item.label === "Headers"));

    const policies = await server.request<CompletionItem[]>("textDocument/completion", { textDocument: { uri }, position: { line: 5, character: 5 } });
    assert.ok(policies.some((item) => item.label === "rate-limit-by-key"));

    const hover = await server.request<Hover>("textDocument/hover", { textDocument: { uri }, position: { line: 2, character: 8 } });
    assert.match((hover.contents as MarkupContent).value, /set-header/);
  } finally {
    server.stop();
  }
});

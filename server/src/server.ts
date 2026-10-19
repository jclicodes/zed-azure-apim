// APIM policy language server: completion and hover over stdio.

import { fileURLToPath } from "node:url";
import { createConnection, ProposedFeatures, TextDocuments, TextDocumentSyncKind, MarkupKind } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { complete } from "./completion.ts";
import { hover } from "./hover.ts";
import { referencedNames, scanWorkspace } from "./named-values.ts";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const workspaceNames = new Set<string>();

connection.onInitialize((params) => {
  const roots = params.workspaceFolders?.map((folder) => folder.uri) ?? (params.rootUri ? [params.rootUri] : []);
  // Named values are a nicety: scan in the background and never fail startup.
  for (const root of roots) {
    if (!root.startsWith("file:")) continue;
    scanWorkspace(fileURLToPath(root))
      .then((names) => names.forEach((name) => workspaceNames.add(name)))
      .catch((error: unknown) => connection.console.warn(`named value scan failed: ${String(error)}`));
  }
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ["<", "/", " ", '"', "'", ".", "{"] },
      hoverProvider: true,
    },
    serverInfo: { name: "apim-language-server", version: "0.1.0" },
  };
});

connection.onCompletion(({ textDocument, position, context }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  const text = document.getText();
  // Names from all open documents, so ones typed this session are offered too.
  const namedValues = new Set(workspaceNames);
  for (const open of documents.all()) referencedNames(open.getText()).forEach((name) => namedValues.add(name));
  return complete({
    text,
    offset: document.offsetAt(position),
    ...(context?.triggerCharacter && { trigger: context.triggerCharacter }),
    namedValues,
    toRange: (start, end) => ({ start: document.positionAt(start), end: document.positionAt(end) }),
  });
});

connection.onHover(({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return null;
  const value = hover(document.getText(), document.offsetAt(position));
  return value ? { contents: { kind: MarkupKind.Markdown, value } } : null;
});

documents.listen(connection);
connection.listen();

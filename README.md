# Azure APIM Policies for Zed

Editor support for Azure API Management policy documents: XML with C# policy
expressions.

- **Highlighting**: a dedicated tree-sitter grammar (`tree-sitter-azure-apim`)
  that understands policy expressions the way the gateway does. `@(...)` and
  `@{...}` are matched by balancing brackets, so unescaped `"`, `<` and `&`
  inside expressions (`condition="@(x.GetValueOrDefault<string>("a") == "b")"`)
  parse correctly. Stock XML grammars can't handle that.
- **C# in expressions**: the expression bodies are highlighted as C#, using a
  bundled C# grammar. The C# extension doesn't need to be installed.
- **JSON bodies**: literal `<set-body>{...}</set-body>` content is highlighted as JSON.
- **`{{named-values}}`**: highlighted as named-value references in attributes and text.
- **Completion**, from a bundled language server (`server/`), aware of where
  the cursor is:
  - Elements: only the policies allowed in the current section (`rate-limit`
    in `<inbound>`, `forward-request` in `<backend>`, the section's policies
    inside `<when>`), and a policy's own child elements. Required attributes
    and documented choices become tab stops. Works after `<` or by typing a
    policy name straight into a section.
  - Attributes not yet set on the element, required ones first, then their
    documented values (`exists-action` → `override`, `skip`, ...).
  - Closing tags, and `{{named-values}}` referenced anywhere in the workspace
    or defined in an APIOps `namedValues/` folder.
  - Inside `@(...)`/`@{...}`: members of the `context` object model, followed
    through chains, locals, lambdas and casts
    (`context.Request.Headers.GetValueOrDefault("Authorization", "").AsJwt()?.Claims.`),
    APIM's extension methods, common members of the .NET types the gateway
    allows, and the allowed type names.
- **Hover**: policy and attribute documentation from the Microsoft Learn
  reference, and signatures for expression members.
- **Editing**: closing tags are inserted automatically, there's a structural
  outline (`cmd-shift-o`), bracket matching for tags and expressions, and
  comment toggling.

There are no diagnostics yet: validation still happens when you deploy the policy.

## Install

Zed has no "install from zip". Unzip `azure-apim.zip` into Zed's installed-extensions
directory. Zed watches that directory and loads the extension straight away:

```sh
unzip azure-apim.zip -d ~/Library/Application\ Support/Zed/extensions/installed/
```

On Linux the directory is `~/.local/share/zed/extensions/installed/`. To uninstall,
use the Extensions panel or delete the `azure-apim` directory.

The grammars and extension ship precompiled to WebAssembly, so this needs no
Rust, git or clang on your machine. The language server runs on the Node.js
Zed already manages.

## File association

Files named `policy.xml` (the APIOps layout), `*.policy.xml` or
`*.fragment.xml` are recognised automatically. For other names, add globs to
your Zed `settings.json`:

```json
"file_types": {
  "APIM Policy": ["*-policy.xml", "**/apim/**/*.xml"]
}
```

## Building

The sources are this directory plus the `tree-sitter-azure-apim` grammar
repository, checked out alongside it. `extension.toml` pins both grammar
commits; the build refuses to run if the local grammar checkout isn't clean
and at the pinned commit. Building needs Node.js and Rust (with rustup).

```sh
scripts/build.sh                  # writes dist/azure-apim/ and dist/azure-apim.zip
```

The first build downloads wasi-sdk 34 (the version Zed uses) and the pinned
tree-sitter-c-sharp commit into `.cache/`. Set `WASI_SDK_PATH` to use an
existing wasi-sdk, or pass a grammar directory to `build.sh` if it isn't at
`../tree-sitter-azure-apim`.

Layout:

- `server/`: the language server (TypeScript, `npm test` builds and tests it).
  `server/bundle/` is its build output, committed because the Rust extension
  (`src/lib.rs`) embeds it with `include_str!`; `build.sh` warns if it's stale.
- `data/apim-schema.json`: policies, elements and attributes, extracted from
  the Microsoft Learn policy reference at a pinned docs commit by
  `scripts/extract_schema.py`. The expression type model is hand-written in
  `server/src/csharp-model.ts`.
- `snippets/`: a few multi-line expression idioms; everything else comes from
  the language server.

This directory also works with **zed: install dev extension**. Zed fetches the
grammar from the `file://` checkout `extension.toml` points at, so commit
grammar changes and bump `rev` before reinstalling. Before publishing, point
`repository` at the grammar's public URL.

## Credits

The C# highlight, bracket and indent queries in `languages/apim-expression` are
adapted from [zed-extensions/csharp](https://github.com/zed-extensions/csharp)
(Apache-2.0). The C# grammar is [tree-sitter-c-sharp](https://github.com/tree-sitter/tree-sitter-c-sharp) (MIT).

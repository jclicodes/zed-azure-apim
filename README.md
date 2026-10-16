# Azure APIM Policies for Zed

Syntax support for Azure API Management policy documents: XML with C# policy
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
- **Autocomplete** (snippets):
  - In XML, type `<` and part of a policy name (`<set-h`, `<validate-j`, ...)
    to insert any of the ~70 documented policies, with their required
    attributes and enum choices as tab stops. The section and structural elements
    (`<policies`, `<choose`, `<when`, ...) are covered too.
  - Inside `@(...)`/`@{...}`, completions cover the `context` object model
    (`context.Request.Headers.GetValueOrDefault`, `context.Variables...`), the
    APIM extension methods (`AsJwt`, `AsBasic`, ...) and the .NET types the gateway
    allows in expressions.
- **Editing**: closing tags are inserted automatically, there's a structural
  outline (`cmd-shift-o`), bracket matching for tags and expressions, and
  comment toggling.

There is no language server. Validation still happens when you deploy the policy.

## Install

Zed has no "install from zip". Unzip `azure-apim.zip` into Zed's installed-extensions
directory. Zed watches that directory and loads the extension straight away:

```sh
unzip azure-apim.zip -d ~/Library/Application\ Support/Zed/extensions/installed/
```

On Linux the directory is `~/.local/share/zed/extensions/installed/`. To uninstall,
use the Extensions panel or delete the `azure-apim` directory.

The grammars ship precompiled to WebAssembly, so this needs no Rust, git or
clang on your machine.

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
repository. `extension.toml` pins the grammar commit.

```sh
python3 scripts/gen_snippets.py          # regenerate snippets from data/apim-policies.json
WASI_SDK_PATH=/path/to/wasi-sdk-34 \
  scripts/build.sh ../tree-sitter-azure-apim ../tree-sitter-c-sharp
```

`data/apim-policies.json` is compiled from the Microsoft Learn policy reference.

Once the grammar repository is published at the URL in `extension.toml`, this
directory also works with **zed: install dev extension**.

## Credits

The C# highlight, bracket and indent queries in `languages/apim-expression` are
adapted from [zed-extensions/csharp](https://github.com/zed-extensions/csharp)
(Apache-2.0). The C# grammar is [tree-sitter-c-sharp](https://github.com/tree-sitter/tree-sitter-c-sharp) (MIT).

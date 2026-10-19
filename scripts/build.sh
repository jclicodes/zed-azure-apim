#!/usr/bin/env bash
# Builds a prebuilt, installable copy of the extension and zips it.
#
# Usage: scripts/build.sh [tree-sitter-azure-apim dir]   (default: ../tree-sitter-azure-apim)
#   WASI_SDK_PATH  optional wasi-sdk 34 install; downloaded into .cache/ if unset
#
# The C# grammar is fetched into .cache/ at the revision extension.toml pins.
# Also needs Node.js (server bundle and tests) and Rust with rustup (the
# extension's wasm, as Zed builds it).
#
# Output: dist/azure-apim/ (the layout Zed keeps under extensions/installed/)
# and dist/azure-apim.zip. Grammars are compiled exactly as Zed's extension
# builder does, so the result needs no toolchain on the target machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APIM_GRAMMAR="$(cd "${1:-$ROOT/../tree-sitter-azure-apim}" && pwd)"
CACHE="$ROOT/.cache"
OUT="$ROOT/dist/azure-apim"
WASI_SDK_VERSION=34

# Prints `key` from the [grammars.<name>] table of extension.toml.
grammar_setting() {
  awk -v section="[grammars.$1]" -v key="$2" '
    $0 == section { inside = 1; next }
    /^\[/ { inside = 0 }
    inside && $1 == key { gsub(/"/, "", $3); print $3; exit }
  ' "$ROOT/extension.toml"
}

# Downloads the wasi-sdk release Zed uses into .cache/ unless already there.
ensure_wasi_sdk() {
  WASI_SDK_PATH="$CACHE/wasi-sdk-$WASI_SDK_VERSION"
  [[ -x "$WASI_SDK_PATH/bin/clang" ]] && return
  local platform
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) platform=arm64-macos ;;
    Darwin-x86_64) platform=x86_64-macos ;;
    Linux-x86_64) platform=x86_64-linux ;;
    Linux-aarch64) platform=arm64-linux ;;
    *) echo "no wasi-sdk build for $(uname -sm); set WASI_SDK_PATH" >&2; exit 1 ;;
  esac
  echo "downloading wasi-sdk $WASI_SDK_VERSION ($platform)"
  rm -rf "$WASI_SDK_PATH"
  mkdir -p "$WASI_SDK_PATH"
  curl -fsSL "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$WASI_SDK_VERSION/wasi-sdk-$WASI_SDK_VERSION.0-$platform.tar.gz" |
    tar -xz -C "$WASI_SDK_PATH" --strip-components=1
}

# Shallow-fetches a grammar repository at its pinned revision into .cache/.
fetch_grammar() {
  local name="$1" dir="$CACHE/$1"
  local repository rev
  repository="$(grammar_setting "$name" repository)"
  rev="$(grammar_setting "$name" rev)"
  if [[ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" != "$rev" ]]; then
    echo "fetching $name @ ${rev:0:12}" >&2
    rm -rf "$dir"
    git init -q "$dir"
    git -C "$dir" fetch -q --depth 1 "$repository" "$rev"
    git -C "$dir" checkout -q FETCH_HEAD
  fi
  echo "$dir"
}

compile_grammar() {
  local name="$1" dir="$2"
  local scanner=()
  [[ -f "$dir/src/scanner.c" ]] && scanner=("$dir/src/scanner.c")
  "$WASI_SDK_PATH/bin/clang" -fPIC -shared -Os "-Wl,--export=tree_sitter_${name}" \
    -o "$OUT/grammars/${name}.wasm" -I "$dir/src" "$dir/src/parser.c" "${scanner[@]}"
}

# The wasm must come from the commit extension.toml pins, or a later dev
# install / registry build would ship a different grammar.
APIM_REV="$(git -C "$APIM_GRAMMAR" rev-parse HEAD)"
if [[ "$(grammar_setting azure_apim rev)" != "$APIM_REV" || -n "$(git -C "$APIM_GRAMMAR" status --porcelain)" ]]; then
  echo "extension.toml must pin azure_apim to ${APIM_REV}, and the grammar tree must be clean" >&2
  exit 1
fi

[[ -n "${WASI_SDK_PATH:-}" ]] || ensure_wasi_sdk
CSHARP_GRAMMAR="$(fetch_grammar c_sharp)"

# The language server bundle is committed so a dev install works from a fresh
# clone; rebuild and test it, and flag it if the committed copy is stale.
(cd "$ROOT/server" && npm ci --silent && npm test --silent)
if ! git -C "$ROOT" diff --quiet -- server/bundle; then
  echo "warning: server/bundle changed; commit it so dev installs get this server" >&2
fi

rustup target add wasm32-wasip2 >/dev/null 2>&1 || true
cargo build --manifest-path "$ROOT/Cargo.toml" --release --target wasm32-wasip2 --target-dir "$ROOT/target"

rm -rf "$OUT" "$ROOT/dist/azure-apim.zip"
mkdir -p "$OUT/grammars"

cp "$ROOT/target/wasm32-wasip2/release/azure_apim.wasm" "$OUT/extension.wasm"
compile_grammar azure_apim "$APIM_GRAMMAR"
compile_grammar c_sharp "$CSHARP_GRAMMAR"

cp -R "$ROOT/extension.toml" "$ROOT/languages" "$ROOT/snippets" "$ROOT/LICENSE" "$ROOT/README.md" "$OUT/"

(cd "$ROOT/dist" && zip -qr -X azure-apim.zip azure-apim)
echo "built $ROOT/dist/azure-apim.zip (azure_apim @ ${APIM_REV:0:12})"

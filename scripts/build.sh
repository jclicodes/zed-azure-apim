#!/usr/bin/env bash
# Builds a prebuilt, installable copy of the extension and zips it.
#
# Usage: scripts/build.sh <tree-sitter-azure-apim dir> <tree-sitter-c-sharp dir>
#   WASI_SDK_PATH  wasi-sdk install (Zed uses wasi-sdk 34)
#
# Output: dist/azure-apim/ (the layout Zed keeps under extensions/installed/)
# and dist/azure-apim.zip. Grammars are compiled exactly as Zed's extension
# builder does, so the result needs no toolchain on the target machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APIM_GRAMMAR="$(cd "$1" && pwd)"
CSHARP_GRAMMAR="$(cd "$2" && pwd)"
CLANG="${WASI_SDK_PATH:?set WASI_SDK_PATH}/bin/clang"
OUT="$ROOT/dist/azure-apim"

compile_grammar() {
  local name="$1" dir="$2"
  local scanner=()
  [[ -f "$dir/src/scanner.c" ]] && scanner=("$dir/src/scanner.c")
  "$CLANG" -fPIC -shared -Os "-Wl,--export=tree_sitter_${name}" \
    -o "$OUT/grammars/${name}.wasm" -I "$dir/src" "$dir/src/parser.c" "${scanner[@]}"
}

# The wasm must come from the commit extension.toml pins, or a later dev
# install / registry build would ship a different grammar.
APIM_REV="$(git -C "$APIM_GRAMMAR" rev-parse HEAD)"
if ! grep -q "rev = \"${APIM_REV}\"" "$ROOT/extension.toml" || [[ -n "$(git -C "$APIM_GRAMMAR" status --porcelain)" ]]; then
  echo "extension.toml must pin azure_apim to ${APIM_REV}, and the grammar tree must be clean" >&2
  exit 1
fi

rm -rf "$OUT" "$ROOT/dist/azure-apim.zip"
mkdir -p "$OUT/grammars"

compile_grammar azure_apim "$APIM_GRAMMAR"
compile_grammar c_sharp "$CSHARP_GRAMMAR"

cp -R "$ROOT/extension.toml" "$ROOT/languages" "$ROOT/snippets" "$ROOT/LICENSE" "$ROOT/README.md" "$OUT/"

(cd "$ROOT/dist" && zip -qr -X azure-apim.zip azure-apim)
echo "built $ROOT/dist/azure-apim.zip (azure_apim @ ${APIM_REV:0:12})"

// Named values known in the workspace: `{{name}}` references in policy files,
// plus APIOps `namedValues/<name>/namedValueInformation.json` definitions.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "bin", "obj", "dist", "target", ".cache", ".terraform"]);
const MAX_FILES = 5000;

/** Names referenced as `{{name}}` in `text`. */
export function referencedNames(text: string): string[] {
  return [...text.matchAll(/\{\{([^{}\s"<>]+)\}\}/g)].map((match) => match[1]!);
}

/** Scans `root` for named values. Unreadable files are skipped. */
export async function scanWorkspace(root: string): Promise<Set<string>> {
  const names = new Set<string>();
  let files = 0;
  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files >= MAX_FILES) return;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await visit(path);
      } else if (entry.name.endsWith(".xml")) {
        files++;
        const text = await readFile(path, "utf8").catch(() => "");
        for (const name of referencedNames(text)) names.add(name);
      } else if (entry.name === "namedValueInformation.json") {
        files++;
        const text = await readFile(path, "utf8").catch(() => "{}");
        try {
          const displayName = JSON.parse(text)?.properties?.displayName;
          if (typeof displayName === "string") names.add(displayName);
        } catch {
          // Not JSON; ignore.
        }
      }
    }
  };
  await visit(root);
  return names;
}

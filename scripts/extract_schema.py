#!/usr/bin/env python3
"""Extract an APIM policy schema (data/apim-schema.json) from the Microsoft Learn docs.

Run from anywhere (paths are relative to the repo root):

    python3 scripts/extract_schema.py

The policy reference pages are fetched from the MicrosoftDocs/azure-docs repo at a
pinned commit (REV below) and cached under .cache/azure-docs/<rev>/, so reruns are
offline and deterministic. To refresh the data, bump REV and rerun.

For each page with a "## Policy statement" the script builds the element tree from the
XML statement, then enriches it with the "## Attributes" / "## Elements" tables and the
per-element "### <name> attributes|elements" tables. Anything it cannot map cleanly is
printed as a warning at the end instead of being guessed.
"""

import copy
import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

REPO = "MicrosoftDocs/azure-docs"
REV = "8cfa32bf16357b6ad8c787c61cad3cedb3a10355"

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "azure-docs" / REV
OUT = ROOT / "data" / "apim-schema.json"

RAW = f"https://raw.githubusercontent.com/{REPO}/{REV}"
ARTICLES = "articles/api-management"
INDEX_PAGE = "api-management-policies.md"
DOC_URL = "https://learn.microsoft.com/azure/api-management"

# Pipeline sections. Structural elements (policies, inbound, base, ...) never appear in a policy
# statement, so nothing is filtered; http-data-source's own `backend` child is a real element.
SECTIONS = ("inbound", "outbound", "backend", "on-error")

# (element, attribute) pairs that are policy expressions by nature though the docs don't say so:
# `when/@condition` is documented only as "the Boolean expression ... to be evaluated".
ALWAYS_EXPRESSIONS = {("when", "condition")}

# Legacy names that keep working in APIM but no longer have their own docs page.
ALIASES = {
    "azure-openai-emit-token-metric": "llm-emit-token-metric",
    "azure-openai-semantic-cache-lookup": "llm-semantic-cache-lookup",
    "azure-openai-semantic-cache-store": "llm-semantic-cache-store",
    "azure-openai-token-limit": "llm-token-limit",
}

warnings = []
no_attributes_table = []  # policies whose page has no "## Attributes" table


def warn(policy, msg):
    if (line := f"{policy}: {msg}") not in warnings:
        warnings.append(line)


# ---------------------------------------------------------------- fetching


def fetch(path):
    """Return the text of `path` (repo-relative) at REV, downloading into the cache if needed."""
    dest = CACHE / path
    if not dest.exists():
        url = f"{RAW}/{path}"
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "extract_schema.py"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = r.read()
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    return dest.read_text(encoding="utf-8").replace("\r\n", "\n").lstrip("\ufeff")


def fetch_all(paths):
    """Warm the cache for many paths in parallel."""
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(fetch, paths))


INCLUDE = re.compile(r"\[!INCLUDE\s*\[[^\]]*\]\(([^)]+)\)\s*\]")


def include_file(target):
    """Filename under includes/ for an INCLUDE target, or None for shared content outside this repo."""
    target = target.strip()
    return None if target.startswith("~") else target.split("/")[-1]


def inline_includes(text, depth=0):
    """Replace `[!INCLUDE [..](../../includes/x.md)]` with the include's body (front matter removed)."""

    def repl(m):
        name = include_file(m.group(1))
        if name is None or depth >= 3:
            return ""
        body = re.sub(r"\A---\n.*?\n---\n", "", fetch("includes/" + name), flags=re.S)
        return "\n" + inline_includes(body, depth + 1) + "\n"

    return INCLUDE.sub(repl, text)


def include_paths(text):
    """Repo paths of the includes a page references."""
    return sorted({"includes/" + n for m in INCLUDE.finditer(text) if (n := include_file(m.group(1)))})


# ---------------------------------------------------------------- text cleaning


def clean_text(s, keep_code=False):
    """Markdown/HTML table-cell text -> readable plain text (paragraph breaks and bullets kept)."""
    s = re.sub(r"<sup>.*?</sup>", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>|</br>", "\n", s, flags=re.I)
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)  # [text](url) -> text
    parts = re.split(r"(`[^`]*`)", s)
    for i, p in enumerate(parts):
        if i % 2:
            parts[i] = p if keep_code else p.strip("`")
        else:
            parts[i] = re.sub(r"\*\*(.+?)\*\*|__(.+?)__", lambda m: m.group(1) or m.group(2), p)
            parts[i] = re.sub(r"</?[A-Za-z][^>]*>", "", parts[i])
    s = html.unescape("".join(parts)).replace("\u2019", "'")
    lines = [re.sub(r"[ \t\u00a0]+", " ", ln).strip() for ln in s.split("\n")]
    lines = [re.sub(r"^[-*\u2022]\s*", "- ", ln) for ln in lines]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def first_sentence(s):
    """First sentence of a single-paragraph description."""
    s = " ".join(s.split())
    return re.split(r"(?<=[.!?])\s+(?=[A-Z])", s, maxsplit=1)[0]


# ---------------------------------------------------------------- markdown structure


def split_sections(text):
    """Split markdown into [(level, title, body_lines)] by heading, ignoring `#` inside code fences."""
    sections = [(0, "", [])]
    fenced = False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            fenced = not fenced
        m = None if fenced else re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
        if m:
            sections.append((len(m.group(1)), m.group(2).strip(), []))
        else:
            sections[-1][2].append(line)
    return sections


def first_table(lines):
    """Rows (list of cell lists) of the first markdown table in `lines`, plus the table count."""
    tables, cur = [], []
    for ln in lines + [""]:
        if ln.strip().startswith("|"):
            cur.append(ln.strip())
        elif cur:
            tables.append(cur)
            cur = []
    if not tables:
        return None, 0
    rows = []
    for ln in tables[0]:
        cells = [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", ln.strip("|"))]
        if all(re.fullmatch(r":?-{2,}:?|", c) for c in cells):
            continue  # separator row
        rows.append(cells)
    return rows, len(tables)


@dataclass
class Row:
    """One row of an attribute or element table, already cleaned."""

    name: str
    description: str
    description_code: str  # description with backticks kept (for spotting enumerated literals)
    required: bool
    default: str | None
    raw_required: str


def is_required(cell):
    """True only for an unconditional "Yes" ("Yes, if ..." / "Either X or Y" / "No ..." are false)."""
    c = cell.strip().lower().replace("`", "")
    return bool(re.match(r"yes\b", c)) and not re.search(
        r"\b(if|when|unless|depend\w*|either|or|only|except|otherwise)\b", c)


def parse_rows(table):
    """Map a table's header to columns and return Rows."""
    if not table:
        return []
    header = [clean_text(c).lower() for c in table[0]]

    def col(prefix):
        return next((i for i, h in enumerate(header) if h.startswith(prefix)), None)

    d, r, df = col("description"), col("required"), col("default")
    rows = []
    for cells in table[1:]:
        cell = lambda i: cells[i] if i is not None and i < len(cells) else ""
        default = clean_text(cell(df))
        if not default or re.match(r"(?i)n/a|none$|not set$|[-\u2014]$", default):
            default = None
        rows.append(Row(clean_text(cells[0]), clean_text(cell(d)), clean_text(cell(d), keep_code=True),
                        is_required(cell(r)), default, clean_text(cell(r))))
    return rows


SCOPED_HEADING = re.compile(r"^[`\[]*([\w:.-]+?)[`\]]*[\s-]+(attributes?|elements?)$", re.I)


def parse_tables(text, policy):
    """Return (attr_rows, elem_rows) keyed by lower-case element name.

    attr_rows[element] -> rows of that element's attributes; elem_rows[element] -> rows of its
    child elements. `## Attributes` / `## Elements` belong to the root (key None).
    """
    attr_rows, elem_rows = {}, {}
    for level, title, body in split_sections(text):
        m = SCOPED_HEADING.match(title)
        if title.lower() in ("attributes", "elements") and level == 2:
            owner, kind = None, title.lower()
        elif m and level in (2, 3, 4):
            owner, kind = m.group(1).lower(), m.group(2).lower()
        else:
            continue
        table, count = first_table(body)
        if table is None:
            continue
        if count > 1:
            warn(policy, f"{count} tables under '{title}', used the first")
        target = attr_rows if kind.startswith("attribute") else elem_rows
        target.setdefault(owner, []).extend(parse_rows(table))
    return attr_rows, elem_rows


# ---------------------------------------------------------------- policy statement


@dataclass
class Node:
    """An element as written in the policy statement."""

    name: str
    attrs: list = field(default_factory=list)  # [(name, raw value)]
    children: list = field(default_factory=list)
    self_closing: bool = False
    has_content: bool = False  # any text or comment between the tags


TAG = re.compile(r"<(/?)([A-Za-z][\w:.-]*)((?:[^<>\"]|\"[^\"]*\")*?)(/?)>", re.S)
ATTR = re.compile(r"([\w:.-]+)\s*=\s*\"([^\"]*)\"")


def parse_statement(xml, siblings=None):
    """Parse the (not necessarily well-formed) statement XML into a Node tree.

    Returns (root, unbalanced). With `siblings` ({parent: {child names}}, from the Elements
    tables), an open tag that the docs list as a sibling of the current open element closes it;
    this repairs statements that forget a closing tag.
    """
    xml = re.sub(r"<!(?:-+|\u2014).*?-->", "\0", xml, flags=re.S)  # comments (some are malformed)
    root, stack, pos, unbalanced = None, [], 0, False
    for m in TAG.finditer(xml):
        if stack and xml[pos:m.start()].strip():
            stack[-1].has_content = True
        pos = m.end()
        close, name, attrs, selfc = m.groups()
        if "..." in name:  # placeholder such as <xsl:.../>, not a real element
            continue
        if close:
            if name in [n.name for n in stack]:
                while stack[-1].name != name:
                    stack.pop()
                    unbalanced = True
                stack.pop()
            else:
                unbalanced = True
            continue
        while siblings and len(stack) >= 2 and name in siblings.get(stack[-2].name, ()):
            stack.pop()
        node = Node(name, ATTR.findall(attrs), self_closing=bool(selfc))
        if stack:
            stack[-1].children.append(node)
        elif root is None:
            root = node
        if not selfc:
            stack.append(node)
    unbalanced = unbalanced or bool(stack)
    return root, unbalanced


def find_node(node, name):
    """Depth-first search for the first node called `name`."""
    if node.name == name:
        return node
    for c in node.children:
        if hit := find_node(c, name):
            return hit
    return None


def node_names(node):
    """All element names in the subtree."""
    return {node.name}.union(*(node_names(c) for c in node.children))


# ---------------------------------------------------------------- attribute details


def enum_from_statement(raw):
    """`a | b | c` in the statement -> ['a','b','c'] when every alternative is a bare literal."""
    parts = [p.strip() for p in raw.split("|")]
    if len(parts) > 1 and all(re.fullmatch(r"[\w./*:-]+", p) for p in parts):
        return parts
    return []


ENUM_TRIGGER = re.compile(
    r"(?<!or )(one of the following(?: values)?|following values?|(?:possible|allowed|valid|supported) values?)",
    re.I)  # "or one of the following ..." means the list is not exhaustive, so it is not matched
LITERAL = re.compile(r"[\w./*:-]+")
QUOTED = r"`([^`]+)`|\"([^\"]+)\""


def literals(sentence):
    """Backticked or double-quoted tokens in `sentence` if there are several and all are bare literals."""
    found = [a or b for a, b in re.findall(QUOTED, sentence)]
    return found if len(found) > 1 and all(LITERAL.fullmatch(t) for t in found) else []


def enum_from_description(desc_code):
    """Allowed literals listed in a description (cleaned with backticks kept), or []."""
    m = ENUM_TRIGGER.search(desc_code)
    if m:
        lines = desc_code[m.end():].split("\n")
        bullets = []
        for ln in lines[1:]:  # a bulleted list on the lines after the trigger sentence
            if not ln.strip():
                continue
            if not ln.startswith("- "):
                break
            tok = LITERAL.match(ln[2:].strip().split(" ")[0].strip("`\",:"))
            bullets.append(tok.group(0) if tok else None)
        if bullets and all(bullets):
            return bullets
        if found := literals(re.split(r"\.(?:\s|$)", lines[0])[0]):
            return found
    pair = re.search(r"`(true|false)` or `(true|false)`", desc_code)
    return [pair.group(1), pair.group(2)] if pair else []


def expressions_allowed(desc):
    """Whether the description says policy expressions are allowed (unstated -> False)."""
    if re.search(r"policy expressions?\b[^.]*\b(aren't|are not|isn't|is not) allowed", desc, re.I):
        return False
    return bool(re.search(r"policy expressions?\b[^.]*\b(are|is) allowed|\b(or|using a) policy expression\b(?! variable)",
                          desc, re.I))


def build_attribute(name, raw_value, row):
    """Combine the statement's attribute (raw_value may be None) with its table row (may be None)."""
    values = enum_from_statement(raw_value) if raw_value is not None else []
    desc = row.description if row else ""
    if not values and row:
        values = enum_from_description(row.description_code)
    return {
        "name": name,
        "description": desc,
        "required": row.required if row else False,
        "values": values,
        "default": row.default if row else None,
        "expressions": expressions_allowed(desc),
    }


# ---------------------------------------------------------------- element building


@dataclass
class Ctx:
    """Everything build_element needs about the page being converted."""

    policy: str
    attr_rows: dict  # owner element (lower-case; None = policy root) -> attribute Rows
    elem_rows: dict  # owner element -> child-element Rows
    names: set  # every element name in the statement (see build_element)
    used: set = field(default_factory=set)  # owners whose tables were attached somewhere


def build_element(node, parent_owner, ctx, is_root=False):
    """Convert a statement Node into the output Element, attaching documented attributes/children.

    Tables are keyed by owning element name (None = the policy root); `parent_owner` is the key
    of this node's parent, whose Elements table describes this node. An Elements row for a name
    that appears elsewhere in the statement (e.g. rate-limit lists the nested `operation` next
    to `api`) is not added as an extra child.
    """
    owner = None if is_root else node.name.lower()
    ctx.used.add(owner)
    rows = {r.name: r for r in ctx.attr_rows.get(owner, [])}
    attrs = []
    for n, v in node.attrs:
        if n not in rows:
            warn(ctx.policy, f"<{node.name}> attribute '{n}' is in the statement but has no table row")
        attrs.append(build_attribute(n, v, rows.get(n)))
    seen = {a["name"] for a in attrs}
    for n, row in rows.items():
        if n in seen:
            continue
        if re.fullmatch(r"[\w:.-]+", n):
            attrs.append(build_attribute(n, None, row))
        else:
            warn(ctx.policy, f"<{node.name}> table attribute name '{n}' skipped (not a plain name)")

    for a in attrs:
        if (node.name, a["name"]) in ALWAYS_EXPRESSIONS:
            a["expressions"] = True

    if is_root:
        desc, required = "", True
    else:
        row = next((r for r in ctx.elem_rows.get(parent_owner, []) if r.name == node.name), None)
        if row is None:  # fall back to any Elements table on the page that lists this name
            row = next((r for rs in ctx.elem_rows.values() for r in rs if r.name == node.name), None)
        desc, required = (row.description, row.required) if row else ("", False)

    children = [build_element(c, owner, ctx) for c in node.children]
    # Child elements an Elements table lists but the statement did not show.
    have = {c["name"] for c in children}
    for row in ctx.elem_rows.get(owner, []):
        if row.name in have or row.name in ctx.names:
            continue
        if not re.fullmatch(r"[\w:.-]+", row.name):
            warn(ctx.policy, f"<{node.name}> Elements row '{row.name}' skipped (not a plain name)")
            continue
        warn(ctx.policy, f"<{node.name}> child '{row.name}' only in Elements table (selfClosing assumed false)")
        children.append(build_element(Node(row.name, has_content=True), owner, ctx))
    return {
        "name": node.name,
        "description": desc,
        "required": required,
        "attributes": attrs,
        "children": merge_siblings(children),
        "selfClosing": node.self_closing or (not node.children and not node.has_content),
    }


# ---------------------------------------------------------------- pages


def parse_sections(text):
    """Policy sections from the Usage bullet "Policy sections: inbound, outbound"."""
    for line in text.split("\n"):
        if "Policy sections:" in line:
            tail = clean_text(line).split("Policy sections:", 1)[1]
            found = [t for t in re.findall(r"[a-z-]+", tail.lower()) if t in SECTIONS]
            return [s for s in SECTIONS if s in found]
    return []


def parse_page(page, desc_from_index):
    """Parse one policy page into a policy dict, or None if it has no policy statement."""
    text = inline_includes(fetch(f"{ARTICLES}/{page}"))
    stem = page[:-3]
    guess = stem.removesuffix("-policy")
    m = re.search(r"^## Policy statement[^\n]*\n(.*?)(?=^## )", text, re.S | re.M)
    block = m and re.search(r"```xml[^\n]*\n(.*?)```", m.group(1), re.S)
    if not block:
        return None
    attr_rows, elem_rows = parse_tables(text, guess)
    sibling_names = {(k or guess): {r.name for r in rs} for k, rs in elem_rows.items()}
    tree, unbalanced = parse_statement(block.group(1))
    if unbalanced:
        tree, still = parse_statement(block.group(1), sibling_names)
        warn(guess, "statement XML is unbalanced, " + ("repaired using the Elements tables" if not still else "NOT repaired"))
    # The documented policy may be nested (publish-event is shown inside an http-data-source).
    root = find_node(tree, guess) or tree
    desc = desc_from_index.get(page) or first_paragraph(text)
    ctx = Ctx(root.name, attr_rows, elem_rows, node_names(root))
    element = build_element(root, None, ctx, is_root=True)
    for kind, rows in (("attributes", attr_rows), ("elements", elem_rows)):
        for owner in rows.keys() - ctx.used:
            warn(root.name, f"'{owner} {kind}' table not attached (no <{owner}> in the statement)")
    element["description"] = desc
    sections = parse_sections(text)
    if not sections:
        warn(root.name, "no parseable 'Policy sections:' line (sections left empty)")
    if not attr_rows.get(None):
        no_attributes_table.append(root.name + (" (statement shows attributes)" if root.attrs else ""))
    return {
        "name": root.name,
        "description": desc,
        "docUrl": f"{DOC_URL}/{stem}",
        "sections": sections,
        "element": element,
    }


def first_paragraph(text):
    """Fallback description: first plain paragraph after the page's H1."""
    body = text.split("\n# ", 1)[-1].split("\n", 1)[-1]
    for para in re.split(r"\n\s*\n", body):
        p = para.strip()
        if p and not p.startswith((">", "[!", "#", "```", "|")):
            return first_sentence(clean_text(p))
    return ""


def index_pages(index_text):
    """Policy pages linked from the index table, in document order, with their descriptions."""
    pages, descs = [], {}
    for m in re.finditer(r"^\|\s*\[[^\]]*\]\(([\w-]+\.md)\)[^|]*\|([^|]*)\|", index_text, re.M):
        page = m.group(1)
        if page not in descs:
            pages.append(page)
            descs[page] = first_sentence(clean_text(m.group(2)))
    return pages, descs


def merge_siblings(elements):
    """Collapse repeated same-name siblings (statements show e.g. two `when`s) into one element."""
    merged = {}
    for e in elements:
        if e["name"] in merged:
            merge_elements(merged[e["name"]], e)
        else:
            merged[e["name"]] = e
    return list(merged.values())


def merge_elements(a, b):
    """Union two documentations of the same element (e.g. the Dapr variant of set-backend-service)."""
    names = {x["name"] for x in a["attributes"]}
    for x in b["attributes"]:  # only documented for one variant, so never unconditionally required
        if x["name"] not in names:
            a["attributes"].append({**x, "required": False})
    by_name = {c["name"]: c for c in a["children"]}
    for c in b["children"]:
        if c["name"] in by_name:
            merge_elements(by_name[c["name"]], c)
        else:
            a["children"].append(c)
    a["selfClosing"] = a["selfClosing"] and b["selfClosing"]


def main():
    index_text = fetch(f"{ARTICLES}/{INDEX_PAGE}")
    pages, descs = index_pages(index_text)
    fetch_all([f"{ARTICLES}/{p}" for p in pages])
    fetch_all(sorted({i for p in pages for i in include_paths(fetch(f"{ARTICLES}/{p}"))}))

    policies, skipped = {}, []
    for page in pages:
        policy = parse_page(page, descs)
        if policy is None:
            skipped.append(page)
        elif policy["name"] in policies:
            merge_elements(policies[policy["name"]]["element"], policy["element"])
            warn(policy["name"], f"{page} merged into the earlier page of the same policy")
        else:
            policies[policy["name"]] = policy

    for alias, target in ALIASES.items():
        clone = copy.deepcopy(policies[target])
        clone["name"] = clone["element"]["name"] = alias
        policies[alias] = clone

    out = {"source": {"repository": REPO, "rev": REV}, "policies": list(policies.values())}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report(out["policies"], skipped)


def walk(element):
    yield element
    for c in element["children"]:
        yield from walk(c)


def report(policies, skipped):
    """Print summary stats and anything that did not parse cleanly."""
    attrs = [a for p in policies for e in walk(p["element"]) for a in e["attributes"]]
    print(f"wrote {OUT.relative_to(ROOT)} (rev {REV})")
    print(f"policies: {len(policies)}")
    print(f"policies with zero attributes (any element): "
          f"{[p['name'] for p in policies if not any(e['attributes'] for e in walk(p['element']))]}")
    print(f"policies with zero root attributes: {[p['name'] for p in policies if not p['element']['attributes']]}")
    print(f"attributes: {len(attrs)}; with description: {sum(bool(a['description']) for a in attrs)}; "
          f"with values: {sum(bool(a['values']) for a in attrs)}; "
          f"expressions=true: {sum(a['expressions'] for a in attrs)}; "
          f"required: {sum(a['required'] for a in attrs)}; with default: {sum(a['default'] is not None for a in attrs)}")
    print(f"policies whose page has no Attributes table: {no_attributes_table}")
    print(f"index pages without a policy statement: {skipped}")
    print(f"warnings ({len(warnings)}):")
    for w in warnings:
        print("  " + w)


if __name__ == "__main__":
    sys.exit(main())

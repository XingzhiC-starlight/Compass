#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CSS_FILES = ["src/styles/styles.css", "src/styles/interview.css", "src/styles/landing.css"];

export const TRACKED = [
  "font-size", "font-weight", "line-height", "letter-spacing",
  "border-radius", "padding", "margin", "gap",
  "width", "height", "min-width", "max-width", "min-height", "max-height",
  "box-shadow", "transition", "outline", "opacity",
];
const FOLD = { "padding-inline": "padding", "padding-block": "padding", "margin-inline": "margin", "margin-block": "margin" };
for (const side of ["top", "right", "bottom", "left"]) { FOLD["padding-" + side] = "padding"; FOLD["margin-" + side] = "margin"; }
const SPLIT = new Set(["padding", "margin", "gap", "border-radius"]);

export function parseCss(file, root = ROOT) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const anchors = [];
  const anchorRe = /\/\*\s*(DS §[^*]*?)\s*\*\//g;
  let m;
  while ((m = anchorRe.exec(text))) anchors.push({ line: lineOf(text, m.index), name: m[1].trim() });
  const nearestAnchor = (line) => {
    let best = null;
    for (const a of anchors) if (a.line <= line) best = a.name; else break;
    return best;
  };
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const decls = [];
  const stack = [];
  let buf = "";
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "{") { stack.push(buf.trim()); buf = ""; }
    else if (ch === "}") { flush(i); stack.pop(); buf = ""; }
    else if (ch === ";") { flush(i); buf = ""; }
    else buf += ch;
  }
  function flush(endIdx) {
    const d = buf.trim();
    if (!d || stack.length === 0) return;
    const colon = d.indexOf(":");
    if (colon < 0) return;
    const prop = d.slice(0, colon).trim();
    const value = d.slice(colon + 1).trim().replace(/\s+/g, " ");
    if (!prop || !value) return;
    const line = lineOf(stripped, endIdx - d.length);
    decls.push({ file, line, selector: stack.filter((s) => !s.startsWith("@")).join(" ") || stack.join(" "), atRule: stack.find((s) => s.startsWith("@")) || null, prop, value, anchor: nearestAnchor(line) });
  }
  return { decls, anchors };
}

function lineOf(text, idx) { let n = 1; for (let i = 0; i < idx && i < text.length; i++) if (text[i] === "\n") n++; return n; }

export function scanInline(dir = "src", root = ROOT) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) {
        const text = fs.readFileSync(path.join(root, p), "utf8");
        const re = /(?:style=\{\{|:\s*CSSProperties\s*=\s*\{)([\s\S]*?)\}\}?/g;
        let m;
        while ((m = re.exec(text))) {
          const line = lineOf(text, m.index);
          for (const pair of m[1].split(/,(?![^(]*\))/)) {
            const kv = pair.split(":");
            if (kv.length < 2) continue;
            const prop = kv[0].trim().replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
            const value = kv.slice(1).join(":").trim().replace(/^["']|["']$/g, "");
            if (prop && value) out.push({ file: p, line, prop, value });
          }
        }
      }
    }
  };
  walk(dir);
  return out;
}

export function census(root = ROOT) {
  const parsed = CSS_FILES.map((f) => parseCss(f, root));
  const decls = parsed.flatMap((p) => p.decls);
  const anchors = Object.fromEntries(CSS_FILES.map((f, i) => [f, parsed[i].anchors]));
  const tokens = decls.filter((d) => d.prop.startsWith("--")).map(({ prop, ...rest }) => ({ name: prop, ...rest }));
  const props = {};
  for (const prop of TRACKED) {
    const uses = decls.filter((d) => d.prop === prop || FOLD[d.prop] === prop);
    const byValue = new Map();
    for (const u of uses) {
      const parts = SPLIT.has(prop) ? splitShorthand(u.value) : [u.value];
      for (const part of parts) {
        const key = part;
        if (!byValue.has(key)) byValue.set(key, { value: key, viaToken: /var\(/.test(key), count: 0, where: [] });
        const e = byValue.get(key);
        e.count++;
        e.where.push({ file: u.file, line: u.line, selector: u.selector, anchor: u.anchor });
      }
    }
    props[prop] = [...byValue.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
  const colors = new Map();
  const inline = scanInline("src", root);
  const privacy = parseHtmlStyle("public/privacy.html", root);
  const colorSources = [
    ...decls,
    ...inline.map((i) => ({ file: i.file, line: i.line, selector: "(inline)", prop: i.prop, value: i.value, anchor: null })),
    ...privacy,
  ];
  for (const d of colorSources) {
    for (const m of d.value.match(colorRe) ?? []) {
      const key = m.replace(/\s+/g, "");
      if (!colors.has(key)) colors.set(key, { value: key, count: 0, where: [] });
      const e = colors.get(key);
      e.count++;
      e.where.push({ file: d.file, line: d.line, selector: d.selector, prop: d.prop, inToken: d.prop.startsWith("--"), anchor: d.anchor });
    }
  }
  const colorLiterals = [...colors.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return { files: CSS_FILES, anchors, tokens, props, colorLiterals, inline };
}

function parseHtmlStyle(file, root = ROOT) {
  if (!fs.existsSync(path.join(root, file))) return [];
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (!m) return [];
  const out = [];
  const offset = lineOf(html, m.index);
  for (const d of m[1].matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
    out.push({ file, line: offset + lineOf(m[1], d.index) - 1, selector: "(privacy.html)", prop: d[1], value: d[2].trim(), anchor: null });
  }
  return out;
}

function splitShorthand(value) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if ((ch === " " || ch === "/") && depth === 0) { if (cur) parts.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function short(file) { return file.replace("src/styles/", ""); }

export function toMarkdown(c) {
  const lines = [];
  lines.push("# Design census", "", `Files: ${c.files.join(", ")}`, "");
  lines.push(`## Custom properties (${c.tokens.length})`, "", "| token | value | where | anchor |", "|---|---|---|---|");
  for (const t of c.tokens) lines.push(`| \`${t.name}\` | \`${t.value}\` | ${short(t.file)}:${t.line} ${t.selector} | ${t.anchor ?? "—"} |`);
  lines.push("");
  for (const prop of TRACKED) {
    const rows = c.props[prop];
    const literals = rows.filter((r) => !r.viaToken);
    const tokened = rows.filter((r) => r.viaToken);
    lines.push(`## ${prop} — ${literals.length} distinct literals, ${tokened.length} token forms`, "", "| value | uses | where |", "|---|---|---|");
    for (const r of rows) {
      const where = summarizeWhere(r.where);
      lines.push(`| \`${r.value}\` | ${r.count} | ${where} |`);
    }
    lines.push("");
  }
  lines.push(`## Color literals (${c.colorLiterals.length}; "token" = defined as a --token's value)`, "", "| value | uses | in token defs | where |", "|---|---|---|---|");
  for (const r of c.colorLiterals) lines.push(`| \`${r.value}\` | ${r.count} | ${r.where.filter((w) => w.inToken).length} | ${summarizeWhere(r.where)} |`);
  lines.push("");
  lines.push(`## Inline style literals in TSX (${c.inline.length})`, "", "| file:line | prop | value |", "|---|---|---|");
  for (const i of c.inline) lines.push(`| ${i.file}:${i.line} | ${i.prop} | \`${i.value}\` |`);
  return lines.join("\n") + "\n";
}

function summarizeWhere(where) {
  const byFile = new Map();
  for (const w of where) {
    const k = short(w.file);
    if (!byFile.has(k)) byFile.set(k, new Set());
    byFile.get(k).add(w.anchor ?? "");
  }
  return [...byFile.entries()].map(([f, a]) => `${f}${[...a].filter(Boolean).length ? " (" + [...a].filter(Boolean).join("; ") + ")" : ""}`).join(", ");
}

export function tables(c) {
  const T = {};
  const sel = (w, n = 3) => [...new Set(w.map((x) => "`" + x.selector.replace(/\s+/g, " ").slice(0, 44) + "`"))].slice(0, n).join(", ");
  for (const [prop, rows] of Object.entries(c.props)) {
    const lines = ["| value | uses | where |", "|---|---|---|"];
    for (const r of rows) lines.push(`| \`${r.value}\` | ${r.count}${r.viaToken ? " (token)" : ""} | ${sel(r.where)} |`);
    T[prop] = lines.join("\n");
  }
  for (const f of c.files) {
    const lines = ["| token | value | defined at |", "|---|---|---|"];
    for (const t of c.tokens.filter((t) => t.file === f)) lines.push(`| \`${t.name}\` | \`${t.value.replace(/\|/g, "\\|")}\` | \`${t.selector}\`${t.atRule ? " in `" + t.atRule + "`" : ""}${t.anchor ? " · " + t.anchor.replace(/^DS /, "") : ""} |`);
    T["tokens:" + short(f)] = lines.join("\n");
  }
  {
    const lines = ["| literal | uses | where |", "|---|---|---|"];
    for (const r of c.colorLiterals) {
      const lit = r.where.filter((w) => !w.inToken);
      if (!lit.length) continue;
      lines.push(`| \`${r.value}\` | ${lit.length} | ${[...new Set(lit.map((w) => "`" + (w.selector === "(inline)" ? short(w.file) : w.selector).replace(/\s+/g, " ").slice(0, 40) + "` " + w.prop))].slice(0, 3).join(", ")} |`);
    }
    T["color-literals"] = lines.join("\n");
  }
  {
    const lines = ["| file | count | properties |", "|---|---|---|"];
    const by = new Map();
    for (const i of c.inline) { if (!by.has(i.file)) by.set(i.file, []); by.get(i.file).push(i.prop); }
    for (const [f, ps] of by) lines.push(`| \`${f}\` | ${ps.length} | ${[...new Set(ps)].join(", ")} |`);
    T["inline"] = lines.join("\n");
  }
  return T;
}

export function writeTables(c, file = "DESIGN-SYSTEM.md", root = ROOT) {
  const T = tables(c);
  const p = path.join(root, file);
  let text = fs.readFileSync(p, "utf8");
  let n = 0;
  text = text.replace(/(<!-- census: ([a-z:.-]+) -->\n)((?:\|[^\n]*\n?)*)/g, (m, marker, key) => {
    if (!(key in T)) return m;
    n++;
    return marker + T[key] + "\n";
  });
  fs.writeFileSync(p, text);
  return n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const c = census();
  if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(c, null, 2));
  else if (process.argv.includes("--write")) console.log(`design-census: rewrote ${writeTables(c)} tables in DESIGN-SYSTEM.md`);
  else process.stdout.write(toMarkdown(c));
}

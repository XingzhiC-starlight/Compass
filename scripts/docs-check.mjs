#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { census, TRACKED } from "./design-census.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RATIFIED = ["DESIGN-SYSTEM.md"];
const MANUAL = ["README.md", "AGENTS.md", "CLAUDE.md"];

export function livingDocs(root = REPO) {
  const walkMd = (dir) => {
    const out = [];
    if (!fs.existsSync(path.join(root, dir))) return out;
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walkMd(p));
      else if (e.name.endsWith(".md")) out.push(p);
    }
    return out;
  };
  return [...RATIFIED, ...MANUAL, ...walkMd("docs")];
}

export function check(root = REPO) {
  const ROOT = root;
  const findings = [];
  const report = (file, line, message) => findings.push({ file, line, message });
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const exists = (f) => fs.existsSync(path.join(ROOT, f));

  const LIVING = livingDocs(ROOT);

  const PATH_ROOTS = ["src/", "docs/", "public/", "supabase/", "scripts/", ".design-sync/"];
  const ROOT_FILES = new Set(fs.readdirSync(ROOT));
  function checkPaths(file) {
    const lines = read(file).split("\n");
    lines.forEach((line, i) => {
      const n = i + 1;
      for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) checkTarget(file, n, m[1]);
      for (const m of line.matchAll(/`([^`]+)`/g)) {
        const t = m[1];
        if (/[<>{}*…\s]/.test(t)) continue;
        const looksLikePath = PATH_ROOTS.some((r) => t.startsWith(r)) || (t.startsWith("/") && !t.startsWith("//")) ||
          (ROOT_FILES.has(t.split(/[#:]/)[0]) && /\.[a-z]+$/.test(t.split(/[#:]/)[0]));
        if (looksLikePath) checkTarget(file, n, t);
      }
    });
  }
  function checkTarget(file, n, raw) {
    if (/^(https?:|mailto:|#)/.test(raw)) return;
    let t = raw.replace(/#.*$/, "").replace(/:\d+(-\d+)?$/, "");
    if (!t) return;
    if (t.startsWith("/")) t = "public" + t;
    const rel = path.isAbsolute(t) ? t : path.join(path.dirname(file), t);
    if (exists(rel) || exists(t)) return;
    report(file, n, `path does not resolve: ${raw}`);
  }

  function headingIds(file, re) {
    const ids = [];
    read(file).split("\n").forEach((line, i) => { const m = line.match(re); if (m) ids.push({ id: m[1], file, line: i + 1 }); });
    return ids;
  }
  const specFiles = fs.readdirSync(path.join(ROOT, "docs/spec")).filter((f) => f.endsWith(".md")).sort().map((f) => `docs/spec/${f}`);
  const specSections = specFiles.flatMap((file) => {
    const heads = headingIds(file, /^## §(\d+)\b/);
    const named = path.basename(file).match(/^(\d+)-/)?.[1];
    if (heads.length !== 1 || Number(named) !== Number(heads[0].id)) {
      report(file, heads[0]?.line ?? 1, `a spec file holds exactly one "## §N" heading, the N its name starts with`);
    }
    return heads;
  });
  const dsSections = headingIds("DESIGN-SYSTEM.md", /^## DS §(\d+)\b/);
  const dsSubsections = headingIds("DESIGN-SYSTEM.md", /^### DS §(\d+\.\d+)\b/);
  function checkMonotonic(secs) {
    let prev = -1;
    for (const s of secs) {
      const n = Number(s.id);
      if (n !== prev + 1) report(s.file, s.line, `section §${s.id} breaks the append-only sequence (expected §${prev + 1})`);
      prev = n;
    }
  }
  checkMonotonic(specSections);
  checkMonotonic(dsSections);
  const iIds = specFiles.flatMap((file) => headingIds(file, /^\| (I\d+) \|/));
  const dIds = headingIds("DESIGN-SYSTEM.md", /^\| (D\d+) \|/);
  for (const ids of [iIds, dIds]) {
    const seen = new Map();
    for (const x of ids) { if (seen.has(x.id)) report(x.file, x.line, `${x.id} defined twice (first at ${seen.get(x.id)})`); seen.set(x.id, `${x.file}:${x.line}`); }
  }
  const KNOWN = {
    I: new Set(iIds.map((x) => x.id)), D: new Set(dIds.map((x) => x.id)),
    spec: new Set(specSections.map((x) => x.id)),
    ds: new Set([...dsSections.map((x) => x.id), ...dsSubsections.map((x) => x.id)]),
  };
  function checkCitations(file) {
    let fenced = false;
    read(file).split("\n").forEach((line, i) => {
      if (line.startsWith("```")) { fenced = !fenced; return; }
      if (fenced) return;
      for (const m of line.matchAll(/\b([ID])(\d+)\b/g)) {
        if (m[1] === "D" && /^[Dd]\d+$/.test(m[0]) && line.slice(Math.max(0, m.index - 4), m.index).match(/[\w-]$/)) continue;
        if (!KNOWN[m[1]].has(m[0])) report(file, i + 1, `cites ${m[0]}, which is not defined`);
      }
      for (const m of line.matchAll(/§(\d+(?:\.\d+)?)/g)) {
        const before = line.slice(Math.max(0, m.index - 18), m.index);
        const isDs = /DS|DESIGN-SYSTEM/.test(before) || (file === "DESIGN-SYSTEM.md" && !/\bspec\b/i.test(before));
        const set = isDs ? KNOWN.ds : KNOWN.spec;
        if (!set.has(m[1])) report(file, i + 1, `cites ${isDs ? "DS " : "spec "}§${m[1]}, which does not exist`);
      }
      for (const m of line.matchAll(/README (§\d+|I\d+)/g)) report(file, i + 1, `cites README ${m[1]}; the README holds no sections, cite spec §N or the bare I-n`);
    });
  }

  function checkDesignDrift() {
    const c = census(ROOT);
    const ds = read("DESIGN-SYSTEM.md");
    const defined = new Set(c.tokens.map((t) => t.name));
    for (const f of walkTsx("src")) for (const m of read(f).matchAll(/"(--[a-z0-9-]+)"/g)) defined.add(m[1]);
    const named = new Set([...ds.matchAll(/`(--[a-z0-9-]+)`/g)].map((m) => m[1]));
    for (const t of defined) if (!named.has(t)) report("DESIGN-SYSTEM.md", 1, `token ${t} is defined in the code but not ratified here`);
    for (const t of named) if (!defined.has(t)) report("DESIGN-SYSTEM.md", lineOf(ds, "`" + t + "`"), `token ${t} is named here but not defined anywhere`);
    for (const [file, anchors] of Object.entries(c.anchors)) for (const a of anchors) {
      const id = a.name.match(/§(\d+(?:\.\d+)?)/)?.[1];
      if (!id || !KNOWN.ds.has(id)) report(file, a.line, `anchor "${a.name}" has no DS §${id ?? "?"} heading`);
    }
    const markers = [...ds.matchAll(/<!-- census: ([a-z-]+) -->/g)];
    const seenMarkers = new Set();
    for (const m of markers) {
      const prop = m[1];
      seenMarkers.add(prop);
      if (prop.startsWith("tokens:") || prop === "inline") continue;
      const after = ds.slice(m.index + m[0].length);
      const table = after.split(/\n(?=[^|\n])/)[0];
      const listed = new Set([...table.matchAll(/^\| `([^`]+)` \|/gm)].map((x) => x[1]));
      const line = lineOf(ds, m[0]);
      let inUse;
      if (prop === "color-literals") inUse = new Set(c.colorLiterals.filter((r) => r.where.some((w) => !w.inToken)).map((r) => r.value));
      else if (c.props[prop]) inUse = new Set(c.props[prop].map((r) => r.value));
      else { report("DESIGN-SYSTEM.md", line, `unknown census marker "${prop}"`); continue; }
      for (const v of inUse) if (!listed.has(v)) report("DESIGN-SYSTEM.md", line, `${prop}: value \`${v}\` is in the CSS but not in the ratified table`);
      for (const v of listed) if (!inUse.has(v)) report("DESIGN-SYSTEM.md", line, `${prop}: value \`${v}\` is ratified but no longer in the CSS (regenerate the table)`);
    }
    for (const prop of TRACKED) if (!seenMarkers.has(prop) && c.props[prop].length) report("DESIGN-SYSTEM.md", 1, `no "<!-- census: ${prop} -->" table for a property in use`);
    if (!seenMarkers.has("color-literals")) report("DESIGN-SYSTEM.md", 1, `no "<!-- census: color-literals -->" table`);
  }
  function walkTsx(dir) {
    const out = [];
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walkTsx(p));
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
    }
    return out;
  }
  function lineOf(text, needle) { const i = text.indexOf(needle); return i < 0 ? 1 : text.slice(0, i).split("\n").length; }

  function checkRouting() {
    const agents = read("AGENTS.md");
    const routed = agents.split("\n").filter((l) => l.startsWith("| `")).flatMap((l) => [...l.split("|")[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]));
    const beforeFirstDot = (p) => path.join(path.dirname(p), path.basename(p).split(".")[0]);
    const covered = (f) => routed.some((r) => (r.endsWith("/") ? f.startsWith(r) : beforeFirstDot(f) === beforeFirstDot(r)));
    const line = lineOf(agents, "| Code | Read |");
    for (const dir of ["src", "supabase", "scripts", "browser"]) {
      for (const f of walkFiles(dir)) if (!covered(f)) report("AGENTS.md", line, `${f} is in no row of the routing table`);
    }
  }
  function walkFiles(dir) {
    if (!exists(dir)) return [];
    return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).filter((e) => !e.name.startsWith("."))
      .flatMap((e) => (e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  }

  function checkSeamCatalog() {
    const seam = "src/lib/db.ts";
    const exported = new Set();
    for (const m of read(seam).matchAll(/^export (?:async function|function|const|let|class) (\w+)|^export \{([^}]+)\}/gm)) {
      if (m[1]) { exported.add(m[1]); continue; }
      for (const part of m[2].split(",")) {
        const name = part.trim();
        if (!name || name.startsWith("type ")) continue;
        exported.add(name.split(/\s+as\s+/).pop());
      }
    }
    const marker = "<!-- census: seam -->";
    const file = specFiles.find((f) => read(f).includes(marker));
    if (!file) { report("docs/spec", 1, `no "${marker}" table lists the operations ${seam} exports`); return; }
    const text = read(file);
    const line = lineOf(text, marker);
    const table = text.slice(text.indexOf(marker) + marker.length).split(/\n(?=[^|\n])/)[0];
    const listed = new Set([...table.matchAll(/^\| `([^`]+)` \|/gm)].map((x) => x[1]));
    for (const n of exported) if (!listed.has(n)) report(file, line, `seam: \`${n}\` is exported by ${seam} but not in the table`);
    for (const n of listed) if (!exported.has(n)) report(file, line, `seam: \`${n}\` is in the table but ${seam} no longer exports it`);
  }

  for (const f of LIVING) checkPaths(f);
  for (const f of LIVING) checkCitations(f);
  checkDesignDrift();
  checkRouting();
  checkSeamCatalog();
  return findings;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const findings = check();
  if (findings.length) {
    console.error(findings.map((f) => `${f.file}:${f.line} → ${f.message}`).join("\n"));
    console.error(`\ndocs-check: ${findings.length} finding${findings.length === 1 ? "" : "s"}`);
    process.exit(1);
  }
  console.log(`docs-check: no findings (${livingDocs().length} documents, ${TRACKED.length} tracked design properties)`);
}

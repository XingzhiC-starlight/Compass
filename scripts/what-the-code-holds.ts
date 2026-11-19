import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export type Rule = "the seam" | "an admin key" | "raw HTML";

export interface Finding {
  file: string;
  line: number;
  rule: Rule;
  found: string;
}

export function shippedFiles(root: string): string[] {
  const shipped: string[] = [];
  for (const file of filesUnder(root, "src")) {
    if (path.posix.basename(file).includes(".test.")) continue;
    if (TEST_SUPPORT_LEFT_OUT.includes(file)) continue;
    shipped.push(file);
  }
  if (isFile(path.join(root, "index.html"))) shipped.push("index.html");
  for (const file of filesUnder(root, "public")) {
    if (TEXT_KINDS.has(kindOf(file))) shipped.push(file);
  }
  return shipped.sort();
}

export function seamFindings(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const file of shippedFiles(root)) {
    if (!CODE_KINDS.has(kindOf(file))) continue;
    const text = readText(root, file);
    for (const asked of importsIn(file, text)) {
      const broken = seamRuleBroken(file, asked);
      if (broken) findings.push({ file, line: asked.line, rule: "the seam", found: broken });
    }
  }
  return findings;
}

export function adminKeyFindings(root: string): Finding[] {
  return findingsByLine(root, "an admin key", keyOnLine);
}

export function rawHtmlFindings(root: string): Finding[] {
  return findingsByLine(root, "raw HTML", rawHtmlOnLine);
}

const THE_SEAM = "src/lib/db.ts";
const CLIENT_MODULE = "src/lib/supabase.ts";
const CLIENT_PACKAGE_SCOPE = "@supabase/";
/** The local database (I19): the client module hands it out, and nothing else in the app reaches it. */
const LOCAL_DATABASE = ["src/lib/localClient.ts", "src/lib/localDatabase.ts"];
const TEST_SUPPORT = ["src/lib/practiceCopy.ts", "src/lib/fakeSupabase.ts"];
const TEST_SUPPORT_LEFT_OUT = ["src/lib/practiceCopy.ts"];

const TEXT_KINDS = new Set(["html", "css", "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "json", "svg", "txt", "md"]);
const CODE_KINDS = new Set(["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]);

function isFile(full: string): boolean {
  try {
    return fs.statSync(full).isFile();
  } catch {
    return false;
  }
}

function filesUnder(root: string, folder: string): string[] {
  const found: string[] = [];
  const walk = (relative: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) found.push(child);
    }
  };
  walk(folder);
  return found;
}

function kindOf(file: string): string {
  return path.posix.extname(file).slice(1).toLowerCase();
}

function readText(root: string, file: string): string {
  return fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
}

interface Asked {
  specifier: string;
  line: number;
  typeOnly: boolean;
  reaches?: string;
}

const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  tsx: ts.ScriptKind.TSX,
  jsx: ts.ScriptKind.JSX,
  js: ts.ScriptKind.JS,
  mjs: ts.ScriptKind.JS,
  cjs: ts.ScriptKind.JS,
};

function importsIn(file: string, text: string): Asked[] {
  const kind = SCRIPT_KINDS[kindOf(file)] ?? ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  const asked: Asked[] = [];
  const add = (specifier: ts.Node | undefined, typeOnly: boolean) => {
    if (!specifier || !ts.isStringLiteralLike(specifier)) return;
    const line = source.getLineAndCharacterOfPosition(specifier.getStart(source)).line + 1;
    asked.push({ specifier: specifier.text, line, typeOnly: typeOnly || source.isDeclarationFile });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const typesAlone =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((one) => one.isTypeOnly)));
      add(node.moduleSpecifier, typesAlone);
    } else if (ts.isExportDeclaration(node)) {
      const names = node.exportClause;
      const typesAlone =
        node.isTypeOnly ||
        (names !== undefined && ts.isNamedExports(names) && names.elements.length > 0 && names.elements.every((one) => one.isTypeOnly));
      add(node.moduleSpecifier, typesAlone);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, node.isTypeOnly);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node.arguments[0], false);
    } else if (ts.isCallExpression(node) && isImportMetaGlob(node.expression)) {
      for (const reached of globReaches(file, node)) {
        const line = source.getLineAndCharacterOfPosition(reached.pattern.getStart(source)).line + 1;
        asked.push({ specifier: reached.pattern.text, line, typeOnly: false, reaches: reached.file });
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, true);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return asked.sort((a, b) => a.line - b.line);
}

function isImportMetaGlob(callee: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "glob" &&
    ts.isMetaProperty(callee.expression) &&
    callee.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    callee.expression.name.text === "meta"
  );
}

function globReaches(importer: string, call: ts.CallExpression): { file: string; pattern: ts.StringLiteralLike }[] {
  const [first, options] = call.arguments;
  const written: ts.StringLiteralLike[] = [];
  if (first && ts.isStringLiteralLike(first)) written.push(first);
  else if (first && ts.isArrayLiteralExpression(first)) written.push(...first.elements.filter(ts.isStringLiteralLike));
  let from: string | null = path.posix.dirname(importer);
  if (options && ts.isObjectLiteralExpression(options)) {
    for (const property of options.properties) {
      const named = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) ? property.name.text : "";
      if (named === "base" && ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)) {
        from = globPathFromRoot(path.posix.dirname(importer), property.initializer.text);
      }
    }
  }
  const patterns = written.flatMap((pattern) => {
    const leftOut = pattern.text.startsWith("!");
    const resolved = from === null ? null : globPathFromRoot(from, leftOut ? pattern.text.slice(1) : pattern.text);
    return resolved === null ? [] : [{ pattern, leftOut, matches: globToRegExp(resolved) }];
  });
  const reaches: { file: string; pattern: ts.StringLiteralLike }[] = [];
  for (const file of [CLIENT_MODULE, ...TEST_SUPPORT]) {
    if (patterns.some((one) => one.leftOut && one.matches.test(file))) continue;
    const taken = patterns.find((one) => !one.leftOut && one.matches.test(file));
    if (taken) reaches.push({ file: withoutExtension(file), pattern: taken.pattern });
  }
  return reaches;
}

function globPathFromRoot(from: string, written: string): string | null {
  if (written.startsWith("/")) return path.posix.normalize(written.slice(1));
  if (written.startsWith("./") || written.startsWith("../")) return path.posix.normalize(path.posix.join(from, written));
  return null;
}

function globToRegExp(glob: string): RegExp {
  const special = /[.+^$()|\\\]]/g;
  let out = "";
  let braces = 0;
  for (let at = 0; at < glob.length; at++) {
    const char = glob[at];
    if (char === "*" && glob[at + 1] === "*") {
      const wholeFolders = glob[at + 2] === "/";
      out += wholeFolders ? "(?:.*/)?" : ".*";
      at += wholeFolders ? 2 : 1;
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else if (char === "{") {
      braces++;
      out += "(?:";
    } else if (char === "}" && braces > 0) {
      braces--;
      out += ")";
    } else if (char === "," && braces > 0) out += "|";
    else if (char === "[" && glob.indexOf("]", at + 2) !== -1) {
      const end = glob.indexOf("]", at + 2);
      out += `[${glob.slice(at + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
      at = end;
    } else out += char.replace(special, "\\$&").replace("[", "\\[").replace("{", "\\{").replace("}", "\\}");
  }
  while (braces-- > 0) out += ")";
  return new RegExp(`^${out}$`);
}

function moduleNamed(importer: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  return resolved.replace(/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/, "");
}

const withoutExtension = (file: string) => file.replace(/\.(ts|tsx)$/, "");

function seamRuleBroken(importer: string, asked: Asked): string | null {
  const reached = asked.reaches ?? moduleNamed(importer, asked.specifier);
  if (reached === withoutExtension(CLIENT_MODULE) && importer !== THE_SEAM) {
    return `imports "${asked.specifier}", the client module, which only the seam (${THE_SEAM}) may import`;
  }
  const local = LOCAL_DATABASE.find((one) => reached === withoutExtension(one));
  if (local && !asked.typeOnly && importer !== CLIENT_MODULE && !LOCAL_DATABASE.includes(importer)) {
    return `imports "${asked.specifier}", the local database (${local}), which only the client module (${CLIENT_MODULE}) may import`;
  }
  const support = TEST_SUPPORT.find((one) => reached === withoutExtension(one));
  if (support && importer !== support) {
    return `imports "${asked.specifier}", the test support (${support}), which the app never imports`;
  }
  const isPackage = reached.startsWith(CLIENT_PACKAGE_SCOPE);
  if (isPackage && !asked.typeOnly && importer !== CLIENT_MODULE) {
    return `imports "${asked.specifier}", the client's package, for its value; only the client module (${CLIENT_MODULE}) may`;
  }
  return null;
}

function findingsByLine(root: string, rule: Rule, judge: (line: string, next: string) => string | null): Finding[] {
  const findings: Finding[] = [];
  for (const file of shippedFiles(root)) {
    if (!TEXT_KINDS.has(kindOf(file))) continue;
    readText(root, file)
      .split(/\r?\n/)
      .forEach((text, index, all) => {
        const found = judge(text, all[index + 1] ?? "");
        if (found) findings.push({ file, line: index + 1, rule, found });
      });
  }
  return findings;
}

const THREE_PART_TOKEN = /\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;

function keyOnLine(text: string): string | null {
  if (/service_role/i.test(text)) return "the admin key's name, service_role";
  if (/sb_secret_/.test(text)) return "a literal shaped like an admin key (sb_secret_…)";
  const tokens = [...text.matchAll(THREE_PART_TOKEN)];
  if (tokens.some((token) => namesTheAdminRole(token[1]))) {
    return "a three-part token whose middle part names the role service_role";
  }
  if (/\bsb_[A-Za-z0-9]+_/.test(text)) return "a literal shaped like a key (sb_…_…), which the app reads from env";
  if (tokens.length > 0) return "a three-part token shaped like a key, which the app reads from env";
  return null;
}

function namesTheAdminRole(middle: string): boolean {
  try {
    return /"role"\s*:\s*"service_role"/i.test(Buffer.from(middle, "base64url").toString("utf8"));
  } catch {
    return false;
  }
}

const RAW_HTML_WAYS: [RegExp, string][] = [
  [/dangerouslySetInnerHTML/, "React's escape hatch, dangerouslySetInnerHTML"],
  [/\.\s*innerHTML\s*\+?=(?!=)/, "innerHTML assigned"],
  [/\.\s*outerHTML\s*\+?=(?!=)/, "outerHTML assigned"],
  [/\[\s*["'`](?:inner|outer)HTML["'`]\s*\]\s*\+?=(?!=)/, "innerHTML or outerHTML assigned by a bracketed name"],
  [/[{,]\s*["'`]?(?:inner|outer)HTML["'`]?\s*[:,}]/, "innerHTML or outerHTML given as an object's key (as Object.assign takes it)"],
  [/\bsetHTMLUnsafe\b/, "setHTMLUnsafe"],
  [/\bparseHTMLUnsafe\b/, "parseHTMLUnsafe"],
  [/\bparseFromString\b/, "a DOMParser's parseFromString"],
  [/\binsertAdjacentHTML\b/, "insertAdjacentHTML"],
  [/\bdocument\s*\.\s*write(?:ln)?\s*\(/, "document.write"],
  [/\bcreateContextualFragment\b/, "a range's createContextualFragment"],
  [/\bsrcdoc\b/i, "a frame's srcdoc"],
];

const ENDS_ON_THE_NAME = /(?:\.\s*(?:inner|outer)HTML|\[\s*["'`](?:inner|outer)HTML["'`]\s*\])\s*$/;
const BEGINS_WITH_ASSIGNMENT = /^\s*\+?=(?!=)/;

function rawHtmlOnLine(text: string, next: string): string | null {
  const way = RAW_HTML_WAYS.find(([pattern]) => pattern.test(text));
  if (way) return way[1];
  if (ENDS_ON_THE_NAME.test(text) && BEGINS_WITH_ASSIGNMENT.test(next)) {
    return "innerHTML or outerHTML assigned, the = on the next line";
  }
  return null;
}

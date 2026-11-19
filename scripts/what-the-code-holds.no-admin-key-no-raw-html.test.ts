import { afterAll, describe, expect, it } from "vitest";
import { adminKeyFindings, rawHtmlFindings, shippedFiles } from "./what-the-code-holds";
import { REPO, attempt, copyOfTheCode, finding, plant, plantedCopy, removeScratchFolders, scratchRoot, sorted, write } from "./what-the-code-holds.planting";

const CHECK_KEY_HTML =
  "A check fails when the app's code holds an admin key, by its name or its shape, or draws raw HTML, and passes for the code as it is";

afterAll(removeScratchFolders);

function madeUpToken(role: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ iss: "made-up", role, exp: 1 })}.bWFkZS11cC1zaWduYXR1cmU`;
}

describe("the app's code holds no admin key and draws no raw HTML", () => {
  it(`${CHECK_KEY_HTML} — passes for the code as it is: no admin key`, () => {
    expect(attempt(() => adminKeyFindings(REPO))).toEqual([]);
  });

  it(`${CHECK_KEY_HTML} — passes for the code as it is: no raw HTML`, () => {
    expect(attempt(() => rawHtmlFindings(REPO))).toEqual([]);
  });

  it(`${CHECK_KEY_HTML} — passes when the name is held by a test file or by the test support, which are not the app's code`, () => {
    const root = copyOfTheCode();
    plant(root, "src/dashboard/Planted.test.ts", 'const madeUp = { name: "service_role", key: "sb_secret_madeUpForATest0000" };');
    plant(root, "src/lib/practiceCopy.ts", "// planted: the practice copy's service_role is never used");
    plant(root, "scripts/practice/planted.test.ts", 'export const madeUp = "sb_secret_madeUpForATest0000";');

    expect(attempt(() => adminKeyFindings(root))).toEqual([]);
  });

  it(`${CHECK_KEY_HTML} — fails when a screen holds an admin key by its name, in a comment, in any letter case`, () => {
    const root = copyOfTheCode();
    const line = plant(root, "src/dashboard/Sidebar.tsx", "// planted: paste the SERVICE_ROLE key here");

    expect(attempt(() => adminKeyFindings(root))).toEqual([finding("src/dashboard/Sidebar.tsx", line, "an admin key")]);
  });

  it(`${CHECK_KEY_HTML} — fails when a pure module holds an admin key by its shape: sb_secret_`, () => {
    const root = copyOfTheCode();
    const line = plant(root, "src/lib/transforms.ts", 'export const plantedKey = "sb_secret_madeUpValue1234567890abcdef";');

    expect(attempt(() => adminKeyFindings(root))).toEqual([finding("src/lib/transforms.ts", line, "an admin key")]);
  });

  it(`${CHECK_KEY_HTML} — fails when the seam holds an admin key by its shape: a three-part token naming the role`, () => {
    const root = copyOfTheCode();
    const token = madeUpToken("service_role");
    expect(token, "harness: the role's name is not written out in the token").not.toMatch(/service_role/i);
    const line = plant(root, "src/lib/db.ts", `export const plantedToken = "${token}";`);

    expect(attempt(() => adminKeyFindings(root))).toEqual([finding("src/lib/db.ts", line, "an admin key")]);
  });

  it(`${CHECK_KEY_HTML} — fails when the page shell or a static file holds an admin key`, () => {
    const root = copyOfTheCode();
    const shellLine = plant(root, "index.html", "<!-- planted: service_role -->");
    write(root, "public/planted.js", ["// a static script", 'window.plantedKey = "sb_secret_madeUpValue1234567890abcdef";']);

    expect(sorted(attempt(() => adminKeyFindings(root)))).toEqual([
      finding("index.html", shellLine, "an admin key"),
      finding("public/planted.js", 2, "an admin key"),
    ]);
  });

  it(`${CHECK_KEY_HTML} — fails when a screen draws raw HTML through dangerouslySetInnerHTML`, () => {
    const root = copyOfTheCode();
    const line = plant(
      root,
      "src/dashboard/Sidebar.tsx",
      'export const PlantedRaw = ({ s }: { s: string }) => <div dangerouslySetInnerHTML={{ __html: s }} />;',
    );

    expect(attempt(() => rawHtmlFindings(root))).toEqual([finding("src/dashboard/Sidebar.tsx", line, "raw HTML")]);
  });

  it(`${CHECK_KEY_HTML} — fails when a pure module assigns innerHTML`, () => {
    const root = copyOfTheCode();
    const line = plant(root, "src/lib/transforms.ts", "export function plantedPaint(el: HTMLElement, s: string) { el.innerHTML = s; }");

    expect(attempt(() => rawHtmlFindings(root))).toEqual([finding("src/lib/transforms.ts", line, "raw HTML")]);
  });

  const otherWays: { way: string; file: string; line: string }[] = [
    { way: "outerHTML added to", file: "src/dashboard/Planted.ts", line: "export const grow = (el: Element, s: string) => { el.outerHTML += s; };" },
    { way: "insertAdjacentHTML", file: "src/dashboard/Planted.ts", line: 'export const add = (el: Element, s: string) => el.insertAdjacentHTML("beforeend", s);' },
    { way: "document.write", file: "src/dashboard/Planted.ts", line: "export const scribble = (s: string) => document.write(s);" },
    { way: "document.writeln", file: "src/dashboard/Planted.ts", line: "export const scribbleLine = (s: string) => document.writeln(s);" },
    { way: "a range's createContextualFragment", file: "src/dashboard/Planted.ts", line: "export const frag = (s: string) => document.createRange().createContextualFragment(s);" },
    { way: "a frame's srcDoc in JSX", file: "src/dashboard/Planted.tsx", line: "export const Frame = ({ s }: { s: string }) => <iframe srcDoc={s} />;" },
    { way: "document.write in a static page's script", file: "public/planted.html", line: '<p>A static page.</p><script>document.write("made up");</script>' },
  ];
  for (const { way, file, line } of otherWays) {
    it(`${CHECK_KEY_HTML} — fails when the app's code draws raw HTML by ${way}`, () => {
      const root = scratchRoot();
      write(root, file, ["// planted", line]);

      expect(attempt(() => rawHtmlFindings(root))).toEqual([finding(file, 2, "raw HTML")]);
    });
  }
});

const lines = (findings: { file: string; line: number }[]) => findings.map(({ file, line }) => `${file}:${line}`);

describe("the builder's regression tests: an admin key, raw HTML", () => {
  it("a key-shaped literal in a comment is found, and a hyphenated phrase for the key is not its name", () => {
    const root = plantedCopy({
      "src/lib/supabase.ts": [
        "// The service-role (secret) key must never appear in this codebase.",
        "// planted: sb_secret_madeUpInAComment000000",
        `/* planted: ${madeUpToken("service_role")} */`,
        `/* planted: ${madeUpToken("anon")} */`,
        "// planted: sb_publishable_madeUpInAComment0000",
        "// planted: sb_madeUpOther_madeUpInAComment0000",
      ],
    });

    expect(lines(adminKeyFindings(root))).toEqual(["src/lib/supabase.ts:2", "src/lib/supabase.ts:3", "src/lib/supabase.ts:4", "src/lib/supabase.ts:5", "src/lib/supabase.ts:6"]);
  });

  it("a binary file in the public folder is not read, and a text file there is", () => {
    const madeUp = Buffer.from("\u0089PNG service_role sb_secret_madeUp0000 <div dangerouslySetInnerHTML>", "latin1");
    const root = plantedCopy({
      "public/landing/planted.png": madeUp,
      "public/fonts/Planted.ttf": madeUp,
      "public/fonts/OFL-Planted.txt": ["A made-up licence that names service_role."],
    });

    expect(shippedFiles(root)).toEqual(["public/fonts/OFL-Planted.txt"]);
    expect(lines(adminKeyFindings(root))).toEqual(["public/fonts/OFL-Planted.txt:1"]);
    expect(rawHtmlFindings(root)).toEqual([]);
  });

  it("reading markup that is already on the page is not drawing raw HTML", () => {
    const root = plantedCopy({
      "src/lib/transforms.ts": ["export const same = (a: Element, b: Element) => a.innerHTML === b.innerHTML;", "export const read = (a: Element) => a.outerHTML.length;"],
    });

    expect(rawHtmlFindings(root)).toEqual([]);
  });

  it("a planted copy holding every key shape and every raw-HTML way names every finding, without repeating a key", () => {
    const secret = "sb_secret_madeUpEveryWay0000000000";
    const token = madeUpToken("service_role");
    const root = plantedCopy({
      "src/dashboard/Planted.tsx": [
        "// planted: Service_Role",
        `export const a = "${secret}";`,
        `export const b = "${token}";`,
        'export const c = "sb_publishable_madeUpEveryWay0000";',
        `export const d = "${madeUpToken("authenticated")}";`,
        "export const E = ({ s }: { s: string }) => <div dangerouslySetInnerHTML={{ __html: s }} />;",
        "export const f = (el: Element, s: string) => { el.innerHTML = s; };",
        "export const g = (el: Element, s: string) => { el.outerHTML += s; };",
        'export const h = (el: Element, s: string) => el.insertAdjacentHTML("afterbegin", s);',
        "export const i = (s: string) => document.write(s);",
        "export const j = (s: string) => document.writeln(s);",
        "export const k = (s: string) => document.createRange().createContextualFragment(s);",
        "export const L = ({ s }: { s: string }) => <iframe srcDoc={s} />;",
      ],
      "index.html": ['<iframe srcdoc="<p>made up</p>"></iframe>'],
    });

    const keys = adminKeyFindings(root);
    expect(lines(keys)).toEqual([1, 2, 3, 4, 5].map((n) => `src/dashboard/Planted.tsx:${n}`));
    for (const one of keys) {
      expect(one.rule).toBe("an admin key");
      expect(one.found).not.toContain(secret);
      expect(one.found).not.toContain(token);
    }
    const raw = rawHtmlFindings(root);
    expect(lines(raw)).toEqual(["index.html:1", ...[6, 7, 8, 9, 10, 11, 12, 13].map((n) => `src/dashboard/Planted.tsx:${n}`)]);
    expect(new Set(raw.map((one) => one.rule))).toEqual(new Set(["raw HTML"]));
  });

  it("the parsing ways, a bracketed or object-literal innerHTML or outerHTML, and an assignment split across two lines are each found; reading markup is not", () => {
    const root = plantedCopy({
      "src/lib/planted.ts": [
        "export const a = (el: Element, s: string) => el.setHTMLUnsafe(s);",
        "export const b = (s: string) => Document.parseHTMLUnsafe(s);",
        'export const c = (s: string) => new DOMParser().parseFromString(s, "text/html");',
        'export const d = (el: Element, s: string) => { el["innerHTML"] = s; };',
        "export const e = (el: Element, s: string) => { el[`outerHTML`] += s; };",
        "export const f = (el: Element, innerHTML: string) => Object.assign(el, { innerHTML });",
        "export const g = (el: Element, s: string) => Object.assign(el, { outerHTML: s });",
        "export const h = (el: Element, s: string) => {",
        "  el.innerHTML",
        "    = s;",
        "};",
        'export const k = (el: Element) => el["innerHTML"] === "" ? el.outerHTML : el.innerHTML;',
        "export const m = (el: Element) => el.innerHTML",
        "  === el.outerHTML;",
      ],
    });

    expect(lines(rawHtmlFindings(root))).toEqual([1, 2, 3, 4, 5, 6, 7, 9].map((n) => `src/lib/planted.ts:${n}`));
  });

  it("a module of every code kind the build reads — .mts, .cts, .jsx, .cjs — is shipped and read for an admin key and for raw HTML", () => {
    const kinds = ["mts", "cts", "jsx", "cjs"];
    const root = plantedCopy(
      Object.fromEntries(kinds.map((kind) => [`src/lib/planted.${kind}`, ["// planted: service_role", "export const f = (el, s) => { el.innerHTML = s; };"]])),
    );

    expect(shippedFiles(root)).toEqual(kinds.map((kind) => `src/lib/planted.${kind}`).sort());
    expect(lines(adminKeyFindings(root))).toEqual(kinds.map((kind) => `src/lib/planted.${kind}:1`).sort());
    expect(lines(rawHtmlFindings(root))).toEqual(kinds.map((kind) => `src/lib/planted.${kind}:2`).sort());
  });
});

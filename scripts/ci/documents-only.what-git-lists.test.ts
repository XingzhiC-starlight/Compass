// @vitest-environment node

import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { broughtByPullRequest, changedSince } from "./documents-only.mjs";

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};
for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete GIT_ENV[name];

const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) fs.rmSync(folder, { recursive: true, force: true });
});

/** Six lines, so that git recognises a file moved with a small edit as the same file. */
const NOTES = "line1\nline2\nline3\nline4\nline5\nline6\n";

function repository() {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch041-git-")));
  folders.push(top);
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: top, env: GIT_ENV, timeout: 20_000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

  const commit = (files: Record<string, string | null>, message = "change"): string => {
    for (const [relative, text] of Object.entries(files)) {
      const file = path.join(top, ...relative.split("/"));
      if (text === null) fs.rmSync(file);
      else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
      }
    }
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };

  const rename = (from: string, to: string): string => {
    git("mv", from, to);
    git("commit", "-q", "-m", `rename ${from}`);
    return git("rev-parse", "HEAD");
  };

  const onMain = (work: () => void = () => {}): string => {
    git("checkout", "-q", "main");
    work();
    const tip = git("rev-parse", "HEAD");
    git("checkout", "-q", "pr");
    return tip;
  };

  const tested = (head: string): string => {
    git("checkout", "-q", "--detach", "main");
    git("merge", "-q", "--no-ff", "--no-edit", head);
    const merge = git("rev-parse", "HEAD");
    git("checkout", "-q", "pr");
    return merge;
  };

  const run = (head: string) => {
    const merge = tested(head);
    return { merge, earlier: { head, base: git("rev-parse", `${merge}^1`), tree: git("rev-parse", `${merge}^{tree}`) } };
  };

  git("-c", "init.defaultBranch=main", "init", "-q");
  commit({ "src/a.ts": "export const a = 1;\n", "README.md": "# readme\n", "notes.md": NOTES }, "first");
  git("checkout", "-q", "-b", "pr");
  return { top, git, commit, rename, onMain, tested, run };
}

describe("what git lists for the decision", () => {
  it("a push that changed only documents lists only documents", () => {
    const r = repository();
    const { earlier } = r.run(r.commit({ "docs/first.md": "one\n" }));
    const head = r.commit({ "docs/second.md": "two\n" });
    expect(changedSince(earlier, r.tested(head), r.top)).toEqual(["docs/second.md"]);
  });

  it("code the base gained before the earlier run is not counted again", () => {
    const r = repository();
    const first = r.commit({ "docs/first.md": "one\n" });
    r.onMain(() => r.commit({ "src/x.ts": "export const x = 1;\n" }, "add x"));
    const { earlier } = r.run(first);
    const head = r.commit({ "docs/second.md": "two\n" });
    expect(changedSince(earlier, r.tested(head), r.top)).toEqual(["docs/second.md"]);
  });

  it("a code change the base made and undid between the runs leaves nothing to list", () => {
    const r = repository();
    const { earlier } = r.run(r.commit({ "docs/first.md": "one\n" }));
    r.onMain(() => {
      r.commit({ "src/x.ts": "export const x = 1;\n" }, "add x");
      r.commit({ "src/x.ts": null }, "remove x");
    });
    const head = r.commit({ "docs/second.md": "two\n" });
    expect(changedSince(earlier, r.tested(head), r.top)).toEqual(["docs/second.md"]);
  });

  it("a code file the pull request renames to markdown is listed under its old name too", () => {
    const r = repository();
    const { earlier } = r.run(r.commit({ "docs/first.md": "one\n" }));
    const head = r.rename("src/a.ts", "src/a.md");
    const changed = changedSince(earlier, r.tested(head), r.top);
    expect(changed).toContain("src/a.ts");
    expect(changed).toContain("src/a.md");
  });

  it("a code file the base renames to markdown after the earlier run is listed under its old name too", () => {
    const r = repository();
    const first = r.commit({ "docs/first.md": "one\n" });
    const { earlier } = r.run(first);
    r.onMain(() => r.rename("src/a.ts", "src/a.md"));
    expect(changedSince(earlier, r.tested(first), r.top)).toContain("src/a.ts");
  });

  it("a code file the base gained through a merge after the earlier run is listed", () => {
    const r = repository();
    const first = r.commit({ "docs/first.md": "one\n" });
    const { earlier } = r.run(first);
    r.onMain(() => {
      r.git("checkout", "-q", "-b", "side");
      r.commit({ "src/side.ts": "export const side = 1;\n" }, "side");
      r.git("checkout", "-q", "main");
      r.git("merge", "-q", "--no-ff", "--no-edit", "side");
    });
    expect(changedSince(earlier, r.tested(first), r.top)).toContain("src/side.ts");
  });

  it("a merge into the branch that keeps the branch's files but brings back old code is listed", () => {
    const r = repository();
    const first = r.commit({ "docs/first.md": "one\n" });
    r.onMain(() => r.commit({ "src/a.ts": "export const a = 2;\n" }, "a is 2"));
    const { earlier } = r.run(first);
    r.git("merge", "-q", "-s", "ours", "--no-edit", "main");
    expect(changedSince(earlier, r.tested(r.git("rev-parse", "HEAD")), r.top)).toContain("src/a.ts");
  });

  it("a markdown change that git carries into a code file through a rename is listed", () => {
    const r = repository();
    const { earlier } = r.run(r.rename("notes.md", "notes.ts"));
    r.onMain(() => r.commit({ "notes.md": NOTES + "EVIL();\n" }, "edit notes"));
    const head = r.commit({ "docs/second.md": "two\n" });
    expect(changedSince(earlier, r.tested(head), r.top)).toContain("notes.ts");
  });

  it("a base moved to a line that drops code it had is listed", () => {
    const r = repository();
    const first = r.commit({ "docs/first.md": "one\n" });
    const before = r.onMain();
    r.git("branch", "line", before);
    r.onMain(() => r.commit({ "src/x.ts": "export const x = 1;\n" }, "add x"));
    const { earlier } = r.run(first);
    r.git("checkout", "-q", "line");
    r.commit({ "docs/line.md": "line\n" }, "line");
    r.git("merge", "-q", "-s", "ours", "--no-edit", "main");
    r.git("branch", "-f", "main", "line");
    r.git("checkout", "-q", "pr");
    expect(changedSince(earlier, r.tested(first), r.top)).toContain("src/x.ts");
  });

  it("file names come out exactly, spaces, accents and new lines included", () => {
    const r = repository();
    const { earlier } = r.run(r.commit({ "docs/first.md": "one\n" }));
    const odd = ["docs/a note é.md", "src/two\nlines.ts"];
    const head = r.commit(Object.fromEntries(odd.map((name) => [name, "x\n"])));
    expect(changedSince(earlier, r.tested(head), r.top).sort()).toEqual([...odd].sort());
  });

  it("an earlier merge that does not come out as recorded is refused", () => {
    const r = repository();
    const { earlier } = r.run(r.commit({ "docs/first.md": "one\n" }));
    const head = r.commit({ "docs/second.md": "two\n" });
    const wrong = { ...earlier, tree: r.git("rev-parse", `${head}^{tree}`) };
    expect(() => changedSince(wrong, r.tested(head), r.top)).toThrow(/does not come out as it recorded/);
  });

  it("an earlier merge that does not come out cleanly is refused", () => {
    const r = repository();
    const branchSide = r.commit({ "src/a.ts": "export const a = 'branch';\n" });
    const mainSide = r.onMain(() => r.commit({ "src/a.ts": "export const a = 'main';\n" }, "main side"));
    const earlier = { head: branchSide, base: mainSide, tree: r.git("rev-parse", `${mainSide}^{tree}`) };
    const head = r.commit({ "src/a.ts": "export const a = 'main';\n" }, "agree");
    expect(() => changedSince(earlier, r.tested(head), r.top)).toThrow(/git merge-tree failed/);
  });

  it("an earlier commit that is nowhere to be found is refused", () => {
    const r = repository();
    const { earlier } = r.run(r.commit({ "docs/first.md": "one\n" }));
    const head = r.commit({ "docs/second.md": "two\n" });
    const missing = "0123456789abcdef0123456789abcdef01234567";
    expect(() => changedSince({ ...earlier, head: missing }, r.tested(head), r.top)).toThrow(/git fetch failed/);
    expect(() => changedSince({ ...earlier, base: missing }, r.tested(head), r.top)).toThrow(/git fetch failed/);
  });
});

describe("what the pull request brings", () => {
  it("a pull request that brings only markdown lists only markdown, and names main's commit", () => {
    const r = repository();
    r.commit({ "docs/first.md": "one\n", "README.md": "# readme, edited\n" });
    const main = r.onMain();
    const merge = r.tested(r.git("rev-parse", "HEAD"));
    const brought = broughtByPullRequest(merge, r.top);
    expect(brought.base).toBe(main);
    expect(brought.files.sort()).toEqual(["README.md", "docs/first.md"]);
  });

  it("a code file it brings is listed", () => {
    const r = repository();
    const merge = r.tested(r.commit({ "docs/first.md": "one\n", "src/b.ts": "export const b = 1;\n" }));
    expect(broughtByPullRequest(merge, r.top).files).toContain("src/b.ts");
  });

  it("code main gained after the branch was cut is not counted as brought", () => {
    const r = repository();
    const head = r.commit({ "docs/first.md": "one\n" });
    r.onMain(() => r.commit({ "src/x.ts": "export const x = 1;\n" }, "add x"));
    expect(broughtByPullRequest(r.tested(head), r.top).files).toEqual(["docs/first.md"]);
  });

  it("a branch that drops code main gained since the branch was cut does not hide it", () => {
    const r = repository();
    r.onMain(() => r.commit({ "src/x.ts": "export const x = 1;\n" }, "add x"));
    r.git("merge", "-q", "-s", "ours", "--no-edit", "main");
    const head = r.commit({ "docs/first.md": "one\n" });
    expect(broughtByPullRequest(r.tested(head), r.top).files).toContain("src/x.ts");
  });

  it("a code file renamed to markdown is listed under its old name too", () => {
    const r = repository();
    const merge = r.tested(r.rename("src/a.ts", "src/a.md"));
    const files = broughtByPullRequest(merge, r.top).files;
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/a.md");
  });

  it("file names come out exactly, spaces, accents and new lines included", () => {
    const r = repository();
    const odd = ["docs/a note é.md", "src/two\nlines.ts"];
    const merge = r.tested(r.commit(Object.fromEntries(odd.map((name) => [name, "x\n"]))));
    expect(broughtByPullRequest(merge, r.top).files.sort()).toEqual([...odd].sort());
  });

  it("a tested commit that is not a merge is refused", () => {
    const r = repository();
    const head = r.commit({ "docs/first.md": "one\n" });
    expect(() => broughtByPullRequest(head, r.top)).toThrow(/not the pull request merged into its base/);
  });

  it("a tested commit that is nowhere to be found is refused", () => {
    const r = repository();
    expect(() => broughtByPullRequest("0123456789abcdef0123456789abcdef01234567", r.top)).toThrow(/git rev-list failed/);
  });
});

describe("the merge's parents, read once a run", () => {
  it("handed the tested commit's parents, it lists against the first of them, not reading them again", () => {
    const r = repository();
    const first = r.git("rev-parse", "HEAD");
    const head = r.commit({ "docs/first.md": "one\n" });
    r.onMain(() => r.commit({ "docs/main.md": "main\n" }, "main moves"));
    const merge = r.tested(head);
    const brought = broughtByPullRequest(merge, r.top, [merge, first, head]);
    expect(brought.base).toBe(first);
    expect(brought.files.sort()).toEqual(["docs/first.md", "docs/main.md"]);
  });
});

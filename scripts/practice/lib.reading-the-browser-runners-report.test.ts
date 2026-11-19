// @vitest-environment node

import { describe, expect, it } from "vitest";
import { browserFilesNamed, readBrowserReport } from "./lib.mjs";

const ROOT = "/repo";
const RESULTS = "/repo/browser/results";

function result(status: string, retry: number, attachments: { name: string; path: string }[] = []) {
  return { status, retry, attachments: attachments.map((one) => ({ ...one, contentType: "application/octet-stream" })) };
}

const REPORT = {
  config: { rootDir: "/repo/browser" },
  suites: [
    {
      title: "the-journey.browser.ts",
      file: "the-journey.browser.ts",
      specs: [],
      suites: [
        {
          title: "the journey",
          file: "the-journey.browser.ts",
          specs: [
            { title: "opens the landing page", file: "the-journey.browser.ts", line: 28, tests: [{ results: [result("passed", 0), result("passed", 1)] }] },
            {
              title: "signs in",
              file: "the-journey.browser.ts",
              line: 34,
              tests: [
                {
                  results: [
                    result("failed", 0, [{ name: "screenshot", path: `${RESULTS}/signs-in/test-failed-1.png` }, { name: "video", path: `${RESULTS}/signs-in/video.webm` }]),
                    result("failed", 1, [{ name: "screenshot", path: `${RESULTS}/signs-in-retry1/test-failed-1.png` }, { name: "video", path: `${RESULTS}/signs-in-retry1/attachments/video-1.webm` }]),
                  ],
                },
              ],
            },
            { title: "signs out", file: "the-journey.browser.ts", line: 40, tests: [{ results: [result("skipped", 0), result("skipped", 1)] }] },
          ],
        },
      ],
    },
    {
      title: "second-try-on-purpose.browser.ts",
      file: "second-try-on-purpose.browser.ts",
      specs: [
        {
          title: "unsteady",
          file: "second-try-on-purpose.browser.ts",
          line: 16,
          tests: [{ results: [result("failed", 0, [{ name: "screenshot", path: `${RESULTS}/unsteady/test-failed-1.png` }]), result("passed", 1)] }],
        },
      ],
      suites: [],
    },
  ],
  errors: [{ message: "\u001b[31mError: cannot load on purpose\u001b[39m\n    at somewhere", location: { file: "/repo/browser/broken.browser.ts", line: 3 } }],
};

describe("reading the browser runner's report", () => {
  it("reads each check that ran, with its name, place, tries, and the picture and recording of a failure", () => {
    const read = readBrowserReport(REPORT, ROOT, 1);
    expect(read.checks).toEqual([
      { name: "the journey > opens the landing page", file: "browser/the-journey.browser.ts", passed: true, tries: 1, line: 28 },
      {
        name: "the journey > signs in",
        file: "browser/the-journey.browser.ts",
        passed: false,
        tries: 2,
        line: 34,
        picture: "browser/results/signs-in-retry1/test-failed-1.png",
        recording: "browser/results/signs-in-retry1/attachments/video-1.webm",
        firstFailurePicture: "browser/results/signs-in/test-failed-1.png",
      },
      {
        name: "unsteady",
        file: "browser/second-try-on-purpose.browser.ts",
        passed: true,
        tries: 2,
        line: 16,
        firstFailurePicture: "browser/results/unsteady/test-failed-1.png",
      },
    ]);
  });

  it("does not list a stop as needing a second try when only its rerun failed", () => {
    const report = {
      config: { rootDir: "/repo/browser" },
      suites: [
        {
          title: "the-journey.browser.ts",
          file: "the-journey.browser.ts",
          specs: [
            {
              title: "opens the landing page",
              file: "the-journey.browser.ts",
              line: 28,
              tests: [{ results: [result("passed", 0), result("failed", 1, [{ name: "screenshot", path: `${RESULTS}/landing-retry1/test-failed-1.png` }])] }],
            },
          ],
          suites: [],
        },
      ],
      errors: [],
    };
    expect(readBrowserReport(report, ROOT, 1).checks).toEqual([
      {
        name: "opens the landing page",
        file: "browser/the-journey.browser.ts",
        passed: false,
        tries: 1,
        line: 28,
        picture: "browser/results/landing-retry1/test-failed-1.png",
      },
    ]);
  });

  it("says what went wrong outside the checks in plain text, its file named, and that the runner failed the run", () => {
    const read = readBrowserReport(REPORT, ROOT, 1);
    expect(read.troubles).toEqual([
      { file: "browser/broken.browser.ts", what: "something went wrong outside the checks: Error: cannot load on purpose" },
    ]);
    expect(read.runnerFailed).toBe(true);
    expect(readBrowserReport({ suites: [], errors: [] }, ROOT, 0)).toEqual({ checks: [], troubles: [], runnerFailed: false });
  });
});

describe("the names typed after the browser command", () => {
  const available = [
    "browser/a-reset-link.browser.ts",
    "browser/a-second-project-after-a-reload.browser.ts",
    "browser/the-journey.browser.ts",
  ];

  it("matches every file whose path holds a name, each once, in the order of the names", () => {
    expect(browserFilesNamed(["reload", "browser/a-reset-link.browser.ts", "a-reset"], available)).toEqual({
      files: ["browser/a-second-project-after-a-reload.browser.ts", "browser/a-reset-link.browser.ts"],
      without: [],
    });
  });

  it("keeps every name that matches no file, as typed and in the order given; an empty name matches none", () => {
    expect(browserFilesNamed(["typo", "the-journey", ""], available)).toEqual({
      files: ["browser/the-journey.browser.ts"],
      without: ["typo", ""],
    });
  });
});

import { TestRunner } from "vitest";
import { NETWORK_NOTE, leftovers, messagesForLeftovers, takeNetworkAttempts } from "./lib.mjs";

const isAFile = (suite) => "filepath" in suite;

export default class NetworkHeldRunner extends TestRunner {
  async onBeforeRunSuite(suite) {
    await super.onBeforeRunSuite(suite);
    const willRun = (suite.mode === "run" || suite.mode === "queued") && suite.result?.state !== "fail";
    if (isAFile(suite) && !willRun) this.failForWhatIsLeft(suite);
  }

  async onAfterRunSuite(suite) {
    await super.onAfterRunSuite(suite);
    if (isAFile(suite)) this.failForWhatIsLeft(suite);
  }

  failForWhatIsLeft(file) {
    failForWhatIsLeft(file, this.config.name);
  }
}

export function failForWhatIsLeft(file, group) {
  const left = leftovers(takeNetworkAttempts());
  if (left.length === 0) return;
  const error = new Error(messagesForLeftovers(group, left).join("\n"));
  file.result ??= {};
  const before = file.result.errors ?? [];
  file.result.state = "fail";
  file.result.errors = [...before, { name: error.name, message: error.message, stack: error.stack }];
  file.meta ??= {};
  file.meta[NETWORK_NOTE] = { errorAt: before.length, left };
}

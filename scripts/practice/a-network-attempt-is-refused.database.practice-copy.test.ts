import { describe, expect, it } from "vitest";
import { forgetRequestsSent, requestsSent } from "../../src/lib/practiceCopy";
import { NetworkRefused, forgetNetworkAttempts, networkAttempts } from "./lib.mjs";

const PRACTICE_COPY = String(import.meta.env.VITE_SUPABASE_URL);
const PUBLIC_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY);

const ELSEWHERE = [
  "https://made-up-hosted-project.invalid/rest/v1/projects?select=id",
  "http://127.0.0.1:9/rest/v1/projects?select=id",
  "http://127.0.0.1:55321.made-up.invalid/rest/v1/projects",
  "http://127.0.0.1:55321@made-up.invalid/rest/v1/projects",
];

const GUARDED_FOR = Symbol.for("compass.practice.guardedFor");

function expectTheGuardIsSet(): void {
  const page = globalThis as unknown as Record<symbol, unknown>;
  expect(page[GUARDED_FOR], "the guard is set on this page, for the practice copy").toBe(PRACTICE_COPY);
}

describe("the database group runs under its guard", () => {
  it("a request to anywhere but the practice copy is refused and recorded, and a socket is refused", async () => {
    expectTheGuardIsSet();
    forgetNetworkAttempts();

    const answers = [];
    for (const address of ELSEWHERE) answers.push(await fetch(address).catch((error: unknown) => error));
    let socket: unknown;
    try {
      socket = new WebSocket(`${PRACTICE_COPY.replace("http://", "ws://")}/realtime/v1/websocket`);
    } catch (error) {
      socket = error;
    }
    const tried = networkAttempts();
    forgetNetworkAttempts();

    for (const answer of answers) expect(answer).toBeInstanceOf(NetworkRefused);
    expect(socket).toBeInstanceOf(NetworkRefused);
    expect(tried.slice(0, ELSEWHERE.length)).toEqual(ELSEWHERE);
    expect(tried.length).toBe(ELSEWHERE.length + 1);
  });

  it("a request to the practice copy goes through, and the record of what was sent keeps no header", async () => {
    expectTheGuardIsSet();
    forgetRequestsSent();
    forgetNetworkAttempts();

    const address = `${PRACTICE_COPY}/rest/v1/projects?select=id`;
    const answer = await fetch(address, { headers: { apikey: PUBLIC_KEY } });
    const rows = await answer.json();
    const sent = requestsSent();
    forgetRequestsSent();

    expect(answer.status).toBe(200);
    expect(rows, "nobody is signed in, so the owner-only rules answer with no rows").toEqual([]);
    expect(sent).toEqual([{ method: "GET", address, body: null }]);
    expect(JSON.stringify(sent)).not.toContain(PUBLIC_KEY);
    expect(networkAttempts()).toEqual([]);
  });
});

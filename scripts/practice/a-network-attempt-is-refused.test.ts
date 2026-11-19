import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { allowOnlyPracticeCopy, blockNetwork, forgetNetworkAttempts, networkAttempts, NetworkRefused, PracticeRefusal } from "./lib.mjs";

const CHECK_SUITE =
  "In the existing suite no check opens a connection to any database: none is handed the live project's address, loading the seam makes no database client, and a check that tries to reach any network address is refused and fails, with nothing arriving there";

const LIVE = "https://your-project-ref.supabase.co";

type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

function trying<T>(run: () => T): Outcome<T> {
  try {
    return { threw: false, value: run() };
  } catch (error) {
    return { threw: true, error };
  }
}

async function tryingAsync<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
  try {
    return { threw: false, value: await run() };
  } catch (error) {
    return { threw: true, error };
  }
}

function told(outcome: Outcome<unknown>): string {
  if (outcome.threw) return `it threw: ${String(outcome.error)}`;
  return `it answered: ${JSON.stringify(outcome.value)}`;
}

function attemptsOnRecord(): unknown {
  const outcome = trying(() => networkAttempts());
  return outcome.threw ? `(the record could not be read: ${String(outcome.error)})` : outcome.value;
}

function forget(): void {
  try {
    forgetNetworkAttempts();
  } catch {
    /* not built yet: nothing to clear */
  }
}

let server: http.Server;
let pretendDatabase = "";
let arrivals = 0;

beforeAll(async () => {
  server = http.createServer((_request, response) => {
    arrivals += 1;
    response.setHeader("Content-Type", "application/json");
    response.end("[]");
  });
  server.on("connection", () => {
    arrivals += 1;
  });
  server.on("upgrade", (_request, socket) => {
    arrivals += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  pretendDatabase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
}

describe("the network is off for the existing suite", () => {
  it(`${CHECK_SUITE} — a request sent from inside the suite is refused, and nothing arrives at the database`, async () => {
    const address = `${pretendDatabase}/rest/v1/projects?select=*`;
    arrivals = 0;
    forget();

    const outcome = await tryingAsync(() => fetch(address));
    await settle();
    const record = attemptsOnRecord();
    forget();

    expect(arrivals, "what arrived at the pretend database").toBe(0);
    expect(outcome.threw, `the request was refused (${outcome.threw ? told(outcome) : "it was answered by the database"})`).toBe(true);
    expect((outcome.error as { address?: unknown }).address, "the refusal names the address that was tried").toBe(address);
    expect(record, "the attempt is on record").toEqual([address]);
  });

  it(`${CHECK_SUITE} — a WebSocket opened from inside the suite is refused, and nothing arrives at the database`, async () => {
    const address = `${pretendDatabase.replace("http://", "ws://")}/realtime/v1/websocket`;
    arrivals = 0;
    forget();

    let socket: { close?: () => void } | undefined;
    const outcome = trying(() => {
      socket = new WebSocket(address);
      return "a socket";
    });
    await settle();
    try {
      socket?.close?.();
    } catch {
      /* it never opened */
    }
    const record = attemptsOnRecord();
    forget();

    expect(outcome.threw, `opening the socket was refused (${told(outcome)})`).toBe(true);
    expect((outcome.error as { address?: unknown }).address, "the refusal names the address that was tried").toBe(address);
    expect(arrivals, "what arrived at the pretend database").toBe(0);
    expect(record, "the attempt is on record").toEqual([address]);
  });

  it(`${CHECK_SUITE} — an XMLHttpRequest opened from inside the suite is refused, and nothing arrives at the database`, async () => {
    const address = `${pretendDatabase}/auth/v1/token?grant_type=password`;
    arrivals = 0;
    forget();

    const made = trying(() => new XMLHttpRequest());
    const outcome = trying(() => {
      made.value?.open("POST", address);
      return "an open request";
    });
    await settle();
    const record = attemptsOnRecord();
    forget();

    expect(made.threw, "a request object can still be made").toBe(false);
    expect(outcome.threw, `opening it was refused (${told(outcome)})`).toBe(true);
    expect((outcome.error as { address?: unknown }).address, "the refusal names the address that was tried").toBe(address);
    expect(arrivals, "what arrived at the pretend database").toBe(0);
    expect(record, "the attempt is on record").toEqual([address]);
  });

  it(`${CHECK_SUITE} — a suite that undoes its own stubs does not switch the network back on`, async () => {
    const address = `${pretendDatabase}/rest/v1/phases?select=*`;
    arrivals = 0;
    forget();

    try {
      vi.stubGlobal("fetch", async () => new Response("[]"));
    } catch {
      /* a fetch that cannot be stood in for cannot be switched back on either */
    }
    vi.unstubAllGlobals();

    const outcome = await tryingAsync(() => fetch(address));
    await settle();
    forget();

    expect(arrivals, "what arrived at the pretend database").toBe(0);
    expect(outcome.threw, "the request was refused").toBe(true);
    expect((outcome.error as { address?: unknown }).address, "the refusal names the address that was tried").toBe(address);
  });

  it(`${CHECK_SUITE} — on a page, every attempt is refused and recorded in order, whatever the address: the live project's, the practice copy's, any other`, async () => {
    const reached: string[] = [];
    const waysOut = () => ({
      fetch: async (address: unknown) => {
        reached.push(`fetch ${String(address)}`);
        return new Response("[]");
      },
      WebSocket: class {
        constructor(address: unknown) {
          reached.push(`socket ${String(address)}`);
        }
      },
      XMLHttpRequest: class {
        open(_method: string, address: unknown) {
          reached.push(`request ${String(address)}`);
        }
      },
    });
    const page = { ...waysOut(), window: waysOut() };

    const liveRead = `${LIVE}/rest/v1/projects?select=*`;
    const practiceSocket = "ws://127.0.0.1:55321/realtime/v1/websocket";
    const elsewhere = "https://example.com/anything";
    const liveSignIn = `${LIVE}/auth/v1/token?grant_type=password`;

    const switched = trying(() => {
      blockNetwork(page as unknown as typeof globalThis);
      blockNetwork(page as unknown as typeof globalThis);
    });
    forget();

    const first = await tryingAsync(() => page.fetch(liveRead));
    const second = trying(() => new page.WebSocket(practiceSocket));
    const request = trying(() => new page.XMLHttpRequest());
    const third = trying(() => request.value?.open("GET", elsewhere));
    const fourth = await tryingAsync(() => page.window.fetch(liveSignIn));
    const record = attemptsOnRecord();
    forget();

    expect(reached, "what got through to the page's own ways out").toEqual([]);
    expect(switched.threw, `the network was switched off (${told(switched)})`).toBe(false);
    expect(first.error, "fetch was refused").toBeInstanceOf(NetworkRefused);
    expect(second.error, "the WebSocket was refused").toBeInstanceOf(NetworkRefused);
    expect(request.threw, "a request object can still be made").toBe(false);
    expect(third.error, "the XMLHttpRequest was refused when opened").toBeInstanceOf(NetworkRefused);
    expect(fourth.error, "fetch on the page's window was refused").toBeInstanceOf(NetworkRefused);
    expect((first.error as { address?: unknown }).address, "the refusal names the address that was tried").toBe(liveRead);
    expect(record, "every attempt is on record once, in the order tried").toEqual([
      liveRead,
      practiceSocket,
      elsewhere,
      liveSignIn,
    ]);
  });
});

{
  const CHECK_ADDRESS =
    "Pointed at any address that is not the practice copy on this machine — the live project's included — the database command refuses before sending anything";

  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };

  const LIVE = "https://your-project-ref.supabase.co";

  const MADE_UP_HOSTED = "https://madeuphostedprojectx.supabase.co";

  const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";

  type Outcome<T> = { threw: boolean; value?: T; error?: unknown };

  function trying<T>(run: () => T): Outcome<T> {
    try {
      return { threw: false, value: run() };
    } catch (error) {
      return { threw: true, error };
    }
  }

  async function tryingAsync<T>(run: () => Promise<T> | T): Promise<Outcome<T>> {
    try {
      return { threw: false, value: await run() };
    } catch (error) {
      return { threw: true, error };
    }
  }

  function told(outcome: Outcome<unknown>): string {
    if (outcome.threw) return `it threw: ${String(outcome.error)}`;
    try {
      return `it answered: ${JSON.stringify(outcome.value)}`;
    } catch {
      return `it answered: ${String(outcome.value)}`;
    }
  }

  function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function expectRefusal(outcome: Outcome<unknown>, kind: string, why: string): void {
    expect(outcome.threw, `it refused to go on (${told(outcome)})`).toBe(true);
    expect(outcome.error, `it refused as a practice command does (${told(outcome)})`).toBeInstanceOf(PracticeRefusal);
    expect((outcome.error as { kind?: unknown }).kind, why).toBe(kind);
  }

  function attemptsOnRecord(): unknown {
    const outcome = trying(() => networkAttempts());
    return outcome.threw ? `(the record could not be read: ${String(outcome.error)})` : outcome.value;
  }

  function forget(): void {
    try {
      forgetNetworkAttempts();
    } catch {
      /* not built yet: nothing to clear */
    }
  }

  type Reached = { way: string; address: string; init?: unknown };

  const MADE_UP_ROWS = [{ id: "a-made-up-row" }];

  function pretendPage() {
    const reached: Reached[] = [];
    const waysOut = (where: string) => ({
      fetch: async (address: unknown, init?: unknown): Promise<Response> => {
        reached.push(init === undefined ? { way: `${where}fetch`, address: String(address) } : { way: `${where}fetch`, address: String(address), init });
        return new Response(JSON.stringify(MADE_UP_ROWS), { status: 200, headers: { "Content-Type": "application/json" } });
      },
      WebSocket: class {
        constructor(address: unknown) {
          reached.push({ way: `${where}WebSocket`, address: String(address) });
        }
      },
      XMLHttpRequest: class {
        open(_method: string, address: unknown): void {
          reached.push({ way: `${where}XMLHttpRequest`, address: String(address) });
        }
      },
    });
    const page = { ...waysOut(""), window: waysOut("window.") };
    return { page, reached };
  }

  type PretendPage = ReturnType<typeof pretendPage>["page"];

  function scopeOf(page: PretendPage): typeof globalThis {
    return page as unknown as typeof globalThis;
  }

  const NOT_THE_PRACTICE_COPY: [string, unknown][] = [
    ["the live project's address", LIVE],
    ["a made-up hosted project's address", MADE_UP_HOSTED],
    ["another local copy's address, on the tool's default port", "http://127.0.0.1:54321"],
    ["https on the practice copy's host and port", "https://127.0.0.1:55321"],
    ['"localhost" in place of 127.0.0.1', "http://localhost:55321"],
    ["a lookalike that runs the port on into another host", "http://127.0.0.1:55321.example.com"],
    ["a lookalike that uses the address as a sign-in name", "http://127.0.0.1:55321@example.com"],
    ["a lookalike that carries the address in its query", "http://example.com/?http://127.0.0.1:55321"],
    ["the practice copy's address followed by a path", "http://127.0.0.1:55321/rest/v1/projects"],
    ["nothing: undefined", undefined],
    ["nothing: empty text", ""],
  ];

  const ELSEWHERE: [string, string][] = [
    ["the live project", `${LIVE}/rest/v1/projects?select=*`],
    ["a made-up hosted project", `${MADE_UP_HOSTED}/rest/v1/projects?select=*`],
    ["another local copy, on the tool's default port", "http://127.0.0.1:54321/rest/v1/projects?select=*"],
    ["https on the practice copy's host and port", "https://127.0.0.1:55321/rest/v1/projects?select=*"],
    ['"localhost" in place of 127.0.0.1', "http://localhost:55321/rest/v1/projects?select=*"],
    ["a lookalike that runs the port on into another host", "http://127.0.0.1:55321.example.com/rest/v1/phases"],
    ["a lookalike that uses the address as a sign-in name", "http://127.0.0.1:55321@example.com/rest/v1/phases"],
    ["a lookalike that carries the address in its query", "http://example.com/?http://127.0.0.1:55321/rest/v1/phases"],
  ];

  describe("the database group's guard", () => {
    afterEach(() => {
      forget();
    });

    it.each(NOT_THE_PRACTICE_COPY)(
      `${CHECK_ADDRESS} — handed %s, the guard refuses, and a check that ran anyway would reach nothing`,
      async (_what, candidate) => {
        const { page, reached } = pretendPage();
        forget();

        const guarded = trying(() => allowOnlyPracticeCopy(scopeOf(page), candidate, SETTINGS));

        const read = await tryingAsync(() => page.fetch(`${SETTINGS.address}/rest/v1/projects?select=*`));
        const onWindow = await tryingAsync(() => page.window.fetch(`${SETTINGS.address}/auth/v1/token?grant_type=password`));
        const socket = trying(() => new page.WebSocket("ws://127.0.0.1:55321/realtime/v1/websocket"));
        const request = trying(() => new page.XMLHttpRequest());
        const opened = trying(() => request.value?.open("GET", `${SETTINGS.address}/rest/v1/phases?select=*`));
        forget();

        expect(reached, "what got through to the page's own ways out").toEqual([]);
        expectRefusal(guarded, "address", "the reason is that the address is not exactly the practice copy's");
        expect(messageOf(guarded.error).trim().length > 0, "and the refusal says why, in words").toBe(true);
        expect(read.error, `a request sent anyway was refused (${told(read)})`).toBeInstanceOf(NetworkRefused);
        expect(onWindow.error, `so was one sent from the page's window (${told(onWindow)})`).toBeInstanceOf(NetworkRefused);
        expect(socket.error, `so was a WebSocket (${told(socket)})`).toBeInstanceOf(NetworkRefused);
        expect(opened.error, `and an XMLHttpRequest, when opened (${told(opened)})`).toBeInstanceOf(NetworkRefused);
      },
    );

    it(`${CHECK_ADDRESS} — the live project's address is refused even when the settings themselves name it`, async () => {
      const { page, reached } = pretendPage();
      const settings = { ...SETTINGS, address: LIVE };
      forget();

      const guarded = trying(() => allowOnlyPracticeCopy(scopeOf(page), LIVE, settings));
      const read = await tryingAsync(() => page.fetch(`${LIVE}/rest/v1/projects?select=*`));
      forget();

      expect(reached, "what got through to the page's own ways out").toEqual([]);
      expectRefusal(guarded, "address", "an address that is not on this machine is never the practice copy's");
      expect(read.error, `a request sent anyway was refused (${told(read)})`).toBeInstanceOf(NetworkRefused);
    });

    it(`${CHECK_ADDRESS} — and handed the practice copy's own address, the guard lets a request at the practice copy through as it was made, once, while one to the live project is refused`, async () => {
      const { page, reached } = pretendPage();
      forget();

      const guarded = trying(() => {
        allowOnlyPracticeCopy(scopeOf(page), SETTINGS.address, SETTINGS);
        allowOnlyPracticeCopy(scopeOf(page), SETTINGS.address, SETTINGS);
      });

      const add = `${SETTINGS.address}/rest/v1/phases?select=*`;
      const carried = {
        method: "POST",
        headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: "a-made-up-project", name: "Sketch", est_days: 1, sort_order: 0 }),
      };
      const signIn = `${SETTINGS.address}/auth/v1/token?grant_type=password`;

      const added = await tryingAsync(() => page.fetch(add, carried));
      const rows = await tryingAsync(async () => (added.value as Response).json());
      const signedIn = await tryingAsync(() => page.window.fetch(signIn));
      const live = await tryingAsync(() => page.fetch(`${LIVE}/rest/v1/phases?select=*`, carried));
      const record = attemptsOnRecord();
      forget();

      expect(guarded.threw, `the guard accepted the practice copy's own address (${told(guarded)})`).toBe(false);
      expect(live.error, `the request to the live project was refused (${told(live)})`).toBeInstanceOf(NetworkRefused);
      expect((live.error as { address?: unknown }).address, "the refusal names the address that was tried").toBe(
        `${LIVE}/rest/v1/phases?select=*`,
      );
      expect(added.threw, `the request at the practice copy was let through (${told(added)})`).toBe(false);
      expect(signedIn.threw, `so was one sent from the page's window (${told(signedIn)})`).toBe(false);
      expect(reached, "what reached the page's own ways out: each request once, as it was made, and nothing for the live project").toEqual([
        { way: "fetch", address: add, init: carried },
        { way: "window.fetch", address: signIn },
      ]);
      expect(rows.value, "and the practice copy's answer came back").toEqual(MADE_UP_ROWS);
      expect(record, "the refused attempt is on record, and only that one").toEqual([`${LIVE}/rest/v1/phases?select=*`]);
    });

    it.each(ELSEWHERE)(
      `${CHECK_ADDRESS} — with the guard set for the practice copy, a request to %s is refused before anything is sent`,
      async (_what, address) => {
        const { page, reached } = pretendPage();
        forget();

        const guarded = trying(() => allowOnlyPracticeCopy(scopeOf(page), SETTINGS.address, SETTINGS));
        const sent = await tryingAsync(() => page.fetch(address, { method: "GET", headers: { apikey: PUBLIC_KEY } }));
        const fromWindow = await tryingAsync(() => page.window.fetch(address));
        const record = attemptsOnRecord();
        forget();

        expect(guarded.threw, `the guard accepted the practice copy's own address (${told(guarded)})`).toBe(false);
        expect(reached, "what got through to the page's own ways out").toEqual([]);
        expect(sent.error, `the request was refused (${told(sent)})`).toBeInstanceOf(NetworkRefused);
        expect((sent.error as { address?: unknown }).address, "the refusal names the address that was tried").toBe(address);
        expect(fromWindow.error, `so was the same request from the page's window (${told(fromWindow)})`).toBeInstanceOf(NetworkRefused);
        expect(record, "both attempts are on record, in the order tried").toEqual([address, address]);
      },
    );

    it(`${CHECK_ADDRESS} — with the guard set for the practice copy, a WebSocket or an XMLHttpRequest to the live project is refused too`, () => {
      const { page, reached } = pretendPage();
      const socketAddress = `${LIVE.replace("https://", "wss://")}/realtime/v1/websocket`;
      const requestAddress = `${LIVE}/auth/v1/token?grant_type=password`;
      forget();

      const guarded = trying(() => allowOnlyPracticeCopy(scopeOf(page), SETTINGS.address, SETTINGS));
      const socket = trying(() => new page.WebSocket(socketAddress));
      const request = trying(() => new page.XMLHttpRequest());
      const opened = trying(() => request.value?.open("POST", requestAddress));
      const record = attemptsOnRecord();
      forget();

      expect(guarded.threw, `the guard accepted the practice copy's own address (${told(guarded)})`).toBe(false);
      expect(reached, "what got through to the page's own ways out").toEqual([]);
      expect(socket.error, `the WebSocket was refused (${told(socket)})`).toBeInstanceOf(NetworkRefused);
      expect(request.threw, "a request object can still be made").toBe(false);
      expect(opened.error, `the XMLHttpRequest was refused when opened (${told(opened)})`).toBeInstanceOf(NetworkRefused);
      expect(record, "both attempts are on record, in the order tried").toEqual([socketAddress, requestAddress]);
    });
  });
}

{
  const SETTINGS = {
    name: "compass-practice",
    address: "http://127.0.0.1:55321",
    inbox: "http://127.0.0.1:55324",
    app: "http://localhost:5183",
  };

  describe("the network block, handed an address that is not text", () => {
    it("records the address of a URL and of a Request", async () => {
      const reached: string[] = [];
      const page = {
        fetch: async (input: unknown) => {
          reached.push(String(input));
          return new Response("[]");
        },
        WebSocket: class {},
        XMLHttpRequest: class {},
      };
      blockNetwork(page as unknown as typeof globalThis);
      forgetNetworkAttempts();

      const first = await page.fetch(new URL("http://127.0.0.1:55321/rest/v1/phases")).catch((error: unknown) => error);
      const second = await page
        .fetch(new Request("http://127.0.0.1:55321/auth/v1/signup", { method: "POST" }))
        .catch((error: unknown) => error);
      const tried = networkAttempts();
      forgetNetworkAttempts();

      expect(first).toBeInstanceOf(NetworkRefused);
      expect(second).toBeInstanceOf(NetworkRefused);
      expect(tried).toEqual(["http://127.0.0.1:55321/rest/v1/phases", "http://127.0.0.1:55321/auth/v1/signup"]);
      expect(reached).toEqual([]);
    });
  });

  describe("the database group's guard, set twice", () => {
    it("passes a request on once and records it once", async () => {
      const reached: string[] = [];
      const page = {
        fetch: async (input: unknown) => {
          reached.push(String(input));
          return new Response("[]");
        },
        WebSocket: class {},
        XMLHttpRequest: class {},
      };
      const sent = (): unknown[] => {
        const kept = (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("compass.practice.requestsSent")];
        return Array.isArray(kept) ? kept : [];
      };

      allowOnlyPracticeCopy(page as unknown as typeof globalThis, SETTINGS.address, SETTINGS);
      allowOnlyPracticeCopy(page as unknown as typeof globalThis, SETTINGS.address, SETTINGS);
      sent().length = 0;
      const asked = `${SETTINGS.address}/rest/v1/phases?select=id`;
      await page.fetch(asked);
      const recorded = [...sent()];
      sent().length = 0;

      expect(reached).toEqual([asked]);
      expect(recorded).toEqual([{ method: "GET", address: asked, body: null }]);
    });
  });
}

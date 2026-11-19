import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepAwake } from "./commands.mjs";
import { PracticeRefusal } from "./lib.mjs";

const SETTINGS = {
  name: "compass-practice",
  address: "http://127.0.0.1:55321",
  inbox: "http://127.0.0.1:55324",
  app: "http://localhost:5183",
};
const PUBLIC_KEY = "sb_publishable_made_up_for_the_test";

function surroundings(answer: () => Promise<Response> = async () => new Response("[]")) {
  const asked: { address: string; headers: unknown }[] = [];
  const said: string[] = [];
  const around = {
    tool: async () => ({ code: 1, text: "the tool is never asked" }),
    say: (line: string) => {
      said.push(line);
    },
    settings: SETTINGS,
    linked: false,
    request: (async (address: unknown, init?: { headers?: unknown }) => {
      asked.push({ address: String(address), headers: init?.headers });
      return answer();
    }) as unknown as typeof fetch,
  };
  return { around, asked, said };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("keeping the practice copy awake", () => {
  it("asks one small question at once and every ten seconds, with the public key only, and stops when told", async () => {
    const { around, asked, said } = surroundings();

    const awake = keepAwake(around, { address: SETTINGS.address, publicKey: PUBLIC_KEY });
    expect(asked.length, "asked at once").toBe(1);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(asked.length, "not again before ten seconds have passed").toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked.length, "again at ten seconds").toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(asked.length, "and every ten seconds after").toBe(5);

    awake.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked.length, "no more once stopped").toBe(5);

    expect(new Set(asked.map((one) => one.address))).toEqual(
      new Set(["http://127.0.0.1:55321/rest/v1/projects?select=id&limit=1"]),
    );
    expect(asked.map((one) => one.headers)).toEqual(asked.map(() => ({ apikey: PUBLIC_KEY })));
    expect(said, "it never says a line").toEqual([]);
  });

  it("refuses any address that is not exactly the practice copy's, and asks nothing", async () => {
    for (const address of ["https://madeuphostedprojectx.supabase.co", "http://127.0.0.1:54321", "http://localhost:55321", "", undefined]) {
      const { around, asked } = surroundings();
      let refusal: unknown;
      try {
        keepAwake(around, { address: address as string, publicKey: PUBLIC_KEY });
      } catch (error) {
        refusal = error;
      }
      await vi.advanceTimersByTimeAsync(30_000);

      expect(refusal, String(address)).toBeInstanceOf(PracticeRefusal);
      expect((refusal as PracticeRefusal).kind).toBe("address");
      expect(asked, String(address)).toEqual([]);
    }
  });

  it("forgets a question that fails, and goes on asking", async () => {
    let calls = 0;
    const { around, asked } = surroundings(async () => {
      calls += 1;
      if (calls % 2 === 1) throw new Error("the practice copy did not answer");
      return new Response("[]");
    });

    const awake = keepAwake(around, { address: SETTINGS.address, publicKey: PUBLIC_KEY });
    await vi.advanceTimersByTimeAsync(30_000);
    awake.stop();

    expect(asked.length).toBe(4);
  });
});

describe("keeping the practice copy awake, when a question fails", () => {
  it("leaves no rejection unhandled", async () => {
    const unhandled: unknown[] = [];
    const listen = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", listen);
    try {
      const { around } = surroundings(async () => {
        throw new Error("the practice copy did not answer");
      });
      const awake = keepAwake(around, { address: SETTINGS.address, publicKey: PUBLIC_KEY });
      await vi.advanceTimersByTimeAsync(20_000);
      awake.stop();
      // A rejection nobody handled is announced a moment later, in real time.
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 25));
    } finally {
      process.off("unhandledRejection", listen);
    }

    expect(unhandled.map(String)).toEqual([]);
  });
});

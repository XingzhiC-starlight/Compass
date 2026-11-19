// @vitest-environment node

import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startPracticeServer } from "./cli.mjs";
import { startPracticeApp } from "./commands.mjs";
import { PracticeRefusal } from "./lib.mjs";

const TOLD = { supabaseUrl: "http://127.0.0.1:55321", supabaseKey: "made-up-for-a-test", turnstileSiteKey: "" };

describe("the practice app's server, beside a program at its port", () => {
  it("starts nothing and tells the app nothing when the program answers there on 127.0.0.1 alone", async () => {
    const holder = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => holder.listen(0, "127.0.0.1", () => resolve()));
    const port = (holder.address() as net.AddressInfo).port;
    const told = {
      url: process.env.VITE_SUPABASE_URL,
      key: process.env.VITE_SUPABASE_ANON_KEY,
      site: process.env.VITE_TURNSTILE_SITE_KEY,
    };
    let started: { close: () => Promise<void> } | undefined;
    try {
      const outcome = await startPracticeServer(TOLD, `http://localhost:${port}`).then(
        (handle) => {
          started = handle;
          return null;
        },
        (error: unknown) => error,
      );

      expect(outcome, "it refused").toBeInstanceOf(Error);
      expect((outcome as Error).message).toBe(`Port ${port} is already in use: something answers at 127.0.0.1:${port}.`);
      expect(
        { url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY, site: process.env.VITE_TURNSTILE_SITE_KEY },
        "nothing was told to the app",
      ).toEqual(told);
    } finally {
      await started?.close();
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });
});

{
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

  function surroundingsUp() {
    const made = surroundings();
    const tool = async (args: string[]) => {
      if (args[0] === "status") {
        return {
          code: 0,
          text: JSON.stringify({ API_URL: SETTINGS.address, INBUCKET_URL: SETTINGS.inbox, PUBLISHABLE_KEY: PUBLIC_KEY }),
        };
      }
      if (String(args[args.length - 1]).includes("applied:")) {
        return { code: 0, text: " answer\n--------\n applied:0001_init,0002_save_interview\n(1 row)\n" };
      }
      return { code: 1, text: "unknown command\n" };
    };
    return { ...made, around: { ...made.around, tool } };
  }

  describe("starting the practice app", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    type Told = { supabaseUrl: string; supabaseKey: string; turnstileSiteKey: string };

    it("serves at the practice app's address, tells the app the practice copy and no CAPTCHA key", async () => {
      const { around, said } = surroundingsUp();
      const calls: { told: Told; serveAt: string }[] = [];

      const app = await startPracticeApp(around, async (told: Told, serveAt: string) => {
        calls.push({ told, serveAt });
        return { close: async () => {} };
      });

      expect(calls).toEqual([
        { told: { supabaseUrl: SETTINGS.address, supabaseKey: PUBLIC_KEY, turnstileSiteKey: "" }, serveAt: SETTINGS.app },
      ]);
      expect(app.address).toBe(SETTINGS.app);
      expect(said.length).toBe(1);
      expect(said[0]).toContain(SETTINGS.app);
    });

    it("refuses when its address is taken: it tries once, and never another address", async () => {
      const { around, said } = surroundingsUp();
      const tried: string[] = [];

      const refusal = await startPracticeApp(around, async (_told: Told, serveAt: string) => {
        tried.push(serveAt);
        throw new Error("Port 5183 is already in use");
      }).catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(PracticeRefusal);
      expect((refusal as PracticeRefusal).kind).toBe("taken");
      expect((refusal as PracticeRefusal).message).toContain(SETTINGS.app);
      expect(tried).toEqual([SETTINGS.app]);
      expect(said).toEqual([]);
    });

    it("refuses as the tool's failure when the app cannot start for another reason", async () => {
      const { around } = surroundingsUp();

      const refusal = await startPracticeApp(around, async () => {
        throw new Error("the settings could not be read");
      }).catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(PracticeRefusal);
      expect((refusal as PracticeRefusal).kind).toBe("tool");
    });
  });
}

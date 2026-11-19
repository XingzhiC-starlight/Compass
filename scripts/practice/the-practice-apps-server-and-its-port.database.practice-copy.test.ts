// @vitest-environment node

import dns from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, inject, it } from "vitest";
import { startPracticeServer } from "./cli.mjs";

async function aFreePort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
  const { port } = probe.address() as net.AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function answers(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (answered: boolean) => {
      socket.destroy();
      resolve(answered);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function thePage(address: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(address, (response) => {
        let text = "";
        response.on("data", (chunk) => (text += String(chunk)));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, text }));
      })
      .on("error", reject);
  });
}

describe("the practice app's server, with nothing in its way", () => {
  it("starts where the machine resolves localhost, hands out Compass's page, and leaves nothing behind when stopped", async () => {
    const where = inject("practiceCopy") as { address: string; publicKey: string };
    const port = await aFreePort();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "compass-ch033-practice-cache-"));
    const app = await startPracticeServer(
      { supabaseUrl: where.address, supabaseKey: where.publicKey, turnstileSiteKey: "" },
      `http://localhost:${port}`,
      { cacheDir },
    ).catch((error: unknown) => {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      throw error;
    });
    let stopped = false;
    try {
      const page = await thePage(`http://localhost:${port}/`);
      expect(page.status).toBe(200);
      expect(page.text).toContain('id="root"');
      const first = (await dns.lookup("localhost")).address;
      expect(await answers(first, port), `it answers at ${first}, where this machine resolves localhost`).toBe(true);

      await app.close();
      stopped = true;
      expect(await answers("127.0.0.1", port), "nothing at 127.0.0.1 afterwards").toBe(false);
      expect(await answers("::1", port), "nothing at ::1 afterwards").toBe(false);
    } finally {
      if (!stopped) await app.close();
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});

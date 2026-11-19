import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUser, signInWithEmail, signOut } from "./db";
import { getSupabase } from "./supabase";
import type { User } from "./types";

export type PracticeAccountName = "a" | "b";

export interface SentRequest {
  method: string;
  address: string;
  body: string | null;
}

const SENT = Symbol.for("compass.practice.requestsSent");

function record(): SentRequest[] {
  const page = globalThis as unknown as Record<symbol, unknown>;
  if (!Array.isArray(page[SENT])) page[SENT] = [];
  return page[SENT] as SentRequest[];
}

const ACCOUNTS = Symbol.for("compass.practice.accounts");

type PracticeAccount = { name: string; email: string; password: string };

function practiceAccounts(): PracticeAccount[] {
  const page = globalThis as unknown as Record<symbol, unknown>;
  const handed = page[ACCOUNTS];
  if (!Array.isArray(handed) || handed.length === 0) {
    throw new Error(
      "The practice accounts were not handed over: this file is for the database checks, which their setup prepares (npm run test:db).",
    );
  }
  return handed as PracticeAccount[];
}

let signedIn = false;

export async function signInAsPractice(which: PracticeAccountName): Promise<User> {
  const account = practiceAccounts().find((one) => one.name === which);
  if (!account) throw new Error(`There is no practice account "${which}".`);

  signedIn = false;
  await signOut();
  try {
    await signInWithEmail(account.email, account.password);
  } catch {
    throw new Error(
      `The practice account ${account.email} could not sign in. Remake the practice copy with: npm run practice:reset`,
    );
  }
  const user = await getCurrentUser();
  if (!user) {
    throw new Error(
      `The practice account ${account.email} signed in, and the seam knows nobody. Remake the practice copy with: npm run practice:reset`,
    );
  }
  await untilTheSessionIsAccepted(account.email);
  signedIn = true;
  return user;
}

/** The data interface's own words for a fresh session it takes to be from the future. */
const ISSUED_AT_FUTURE = "PGRST303";

async function untilTheSessionIsAccepted(email: string): Promise<void> {
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const refused = async () => {
    const { error } = await getSupabase().from("projects").select("id").limit(1);
    return error?.code === ISSUED_AT_FUTURE;
  };

  let wasRefused = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await refused())) {
      if (!wasRefused) return;
      await pause(400);
      if (!(await refused())) return;
    }
    wasRefused = true;
    await pause(150);
  }
  throw new Error(
    `The practice copy's data interface kept refusing the fresh session of ${email}. Remake the practice copy with: npm run practice:reset`,
  );
}

export async function signOutOfPractice(): Promise<void> {
  signedIn = false;
  await signOut();
  await getSupabase().auth.stopAutoRefresh();
}

export function signedInConnection(): SupabaseClient {
  if (!signedIn) {
    throw new Error("Nobody is signed in to the practice copy yet: sign in first, with signInAsPractice.");
  }
  return getSupabase();
}

export async function signedOutConnection(): Promise<SupabaseClient> {
  signedIn = false;
  await signOut();
  const { data } = await getSupabase().auth.getSession();
  if (data.session) {
    throw new Error(
      "The sign-out did not take: the page still holds a session, so a request would be sent as that account. Remake the practice copy with: npm run practice:reset",
    );
  }
  return getSupabase();
}

export function requestsSent(): SentRequest[] {
  return record().map((request) => ({ ...request }));
}

export function forgetRequestsSent(): void {
  record().length = 0;
}

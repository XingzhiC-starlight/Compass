import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Interview from "./Interview";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_LIMITS =
  "Every box where a person types something Compass saves, on the dashboard, in the sidebar and in the interview, stops at its limit: 4,000 characters for a thought's or task's text, 200 for a project, phase, learning-item or group name and a thought's title; a longer paste keeps its first part";

const KEEP_REAL = vi.hoisted(() => new Set(["SaveFailedError", "todayDate", "getActiveProjectId"]));
vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();
  const quiet: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    quiet[name] = typeof value === "function" && !KEEP_REAL.has(name) ? vi.fn(async () => undefined) : value;
  }
  return quiet;
});

const LIMIT = 200;
const PHASE_EXAMPLE = "e.g. create the design mockup";
const LEARNING_EXAMPLE = "e.g. learning UI design principles";

type Field = HTMLInputElement | HTMLTextAreaElement;
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Interview onComplete={vi.fn()} />);
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  vi.unstubAllGlobals();
});

function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
function textBoxes(): Field[] {
  return Array.from(container.querySelectorAll<Field>("textarea, input")).filter(
    (f) => f instanceof HTMLTextAreaElement || ["text", "search", ""].includes(f.getAttribute("type") ?? ""),
  );
}
function projectNameBox(): Field | null {
  const PROMPT = "Name this project";
  const direct = textBoxes().find(
    (box) => box.placeholder === PROMPT || box.getAttribute("aria-label") === PROMPT || box.title === PROMPT,
  );
  if (direct) return direct;
  const label = Array.from(container.querySelectorAll<HTMLElement>("*")).find(
    (el) => tidy(el.textContent).includes(PROMPT) && !Array.from(el.children).some((c) => tidy(c.textContent).includes(PROMPT)),
  );
  if (!label) return null;
  if (label instanceof HTMLLabelElement && label.control instanceof HTMLInputElement) return label.control;
  return textBoxes().find((box) => label.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) ?? null;
}
function boxWithExample(example: string): Field | null {
  return container.querySelector<Field>(`input[placeholder="${example}"], textarea[placeholder="${example}"]`);
}

function setNativeValue(field: Field, value: string): void {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
async function paste(field: Field, text: string): Promise<void> {
  await act(async () => {
    field.focus();
  });
  if (field.disabled || field.readOnly) return;
  const next = field.maxLength >= 0 && text.length > field.maxLength ? text.slice(0, field.maxLength) : text;
  await act(async () => {
    setNativeValue(field, next);
  });
}

async function expectPasteStopsAt(field: Field | null, what: string): Promise<void> {
  expect(field, `harness: ${what}`).not.toBeNull();
  await paste(field!, "x".repeat(LIMIT) + "TAIL beyond the limit");
  expect(field!.value.length, "the box stops at 200 characters").toBe(LIMIT);
  expect(field!.value, "a longer paste keeps its first part").toBe("x".repeat(LIMIT));
}

describe("the interview's boxes stop at 200 characters", () => {
  it(`${CHECK_LIMITS} — the project's name`, async () => {
    await expectPasteStopsAt(projectNameBox(), 'the box under "Name this project"');
  });

  it(`${CHECK_LIMITS} — a phase's name`, async () => {
    await expectPasteStopsAt(boxWithExample(PHASE_EXAMPLE), `the first phase row ("${PHASE_EXAMPLE}")`);
  });

  it(`${CHECK_LIMITS} — a learning item's name`, async () => {
    await expectPasteStopsAt(boxWithExample(LEARNING_EXAMPLE), `the first learning row ("${LEARNING_EXAMPLE}")`);
  });
});

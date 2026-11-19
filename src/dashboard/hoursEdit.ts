const PLAIN_DECIMAL = /^(\d+\.?\d*|\.\d+)$/;

export function parseHoursEdit(opened: string, typed: string): number | null {
  const text = typed.trim();
  if (text === opened.trim()) return null;
  if (text === "") return null;
  if (!PLAIN_DECIMAL.test(text)) return null;
  return Number(text);
}

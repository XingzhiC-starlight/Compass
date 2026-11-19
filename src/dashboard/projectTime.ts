// Parse a "yyyy-mm-dd" date as a LOCAL calendar day (not UTC), so day
// boundaries line up with the user's clock.
function parseLocal(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dayNumber(startedAt: string): number {
  const start = parseLocal(startedAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
}

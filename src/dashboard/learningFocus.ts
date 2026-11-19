import type { ID, LearningItem } from "../lib/types";

export function hasOpenFocus(items: LearningItem[]): boolean {
  return items.some((it) => it.isFocus && it.progressPct < 100);
}

export function shouldFocusNewLearningItem(
  existing: LearningItem[],
  created: LearningItem,
): boolean {
  return created.progressPct < 100 && !hasOpenFocus(existing);
}

export function markLearningFocus(items: LearningItem[], focusId: ID): LearningItem[] {
  return items.map((it) => ({ ...it, isFocus: it.id === focusId }));
}

export function firstOpenItem(items: LearningItem[]): LearningItem | null {
  return items.find((it) => it.progressPct < 100) ?? null;
}

export function focusAfterReorder(items: LearningItem[], shownFocusId: ID | null = null): ID | null {
  const firstOpen = firstOpenItem(items);
  if (firstOpen) return firstOpen.isFocus ? null : firstOpen.id;
  if (items.some((it) => it.isFocus)) return null;
  return items.some((it) => it.id === shownFocusId) ? shownFocusId : null;
}

export function removeLearningItemAndAdvanceFocus(
  items: LearningItem[],
  removedId: ID,
): { items: LearningItem[]; nextFocusId: ID | null } {
  const removed = items.find((it) => it.id === removedId);
  const remaining = items.filter((it) => it.id !== removedId);

  if (!removed?.isFocus || remaining.length === 0) {
    return { items: remaining, nextFocusId: null };
  }

  const nextFocusId = (firstOpenItem(remaining) ?? remaining[0]).id;
  return {
    items: markLearningFocus(remaining, nextFocusId),
    nextFocusId,
  };
}

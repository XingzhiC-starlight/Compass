/* Preview stories for LearningCard — the Learning module bubble.
   Rows/lists are styled under a `.dashboard` ancestor in styles.css, so each
   cell wraps the card in a .dashboard container the way App.tsx does. */
import { LearningCard } from "compass";

const base = {
  projectId: "p-demo",
  userId: "u-demo",
  createdAt: "2026-07-01T09:00:00Z",
};

const items = [
  { ...base, id: "li-1", name: "React fundamentals", sortOrder: 0, progressPct: 100, isFocus: false },
  { ...base, id: "li-2", name: "Supabase & Row-Level Security", sortOrder: 1, progressPct: 55, isFocus: true },
  { ...base, id: "li-3", name: "TypeScript generics", sortOrder: 2, progressPct: 20, isFocus: false },
  { ...base, id: "li-4", name: "CSS grid & design tokens", sortOrder: 3, progressPct: 0, isFocus: false },
];

/** Summary state — the glance: focus skill, its progress %, and the slider. */
export const Glance = () => (
  <div className="dashboard" style={{ width: 380 }}>
    <LearningCard items={items} depth={false} onToggle={() => {}} />
  </div>
);

/** Depth state — the full roadmap: completion circles, focus tag, click-to-edit percents. */
export const Roadmap = () => (
  <div className="dashboard depth" style={{ width: 420 }}>
    <LearningCard items={items} depth={true} onToggle={() => {}} />
  </div>
);

/** Empty state — a brand-new project with nothing to learn yet. */
export const Empty = () => (
  <div className="dashboard" style={{ width: 380 }}>
    <LearningCard items={[]} depth={false} onToggle={() => {}} />
  </div>
);

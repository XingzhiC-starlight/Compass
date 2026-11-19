/* Preview stories for ThoughtLog — the project-scoped thought feed
   (Libre Baskerville, the design system's one editorial-serif surface).
   .th-log is flex:1, so cells give it a fixed-height flex-column parent,
   the way TaskPanel hosts it. */
import { ThoughtLog } from "compass";

const base = {
  projectId: "p-demo",
  userId: "u-demo",
};

const thoughts = [
  {
    ...base,
    id: "th-1",
    title: "One-clock rule",
    text: "Only one session runs at a time, ever. That constraint IS the product — protect it in every feature that touches time.",
    sortOrder: 0,
    groupId: null,
    createdAt: "2026-08-04T09:12:00Z",
  },
  {
    ...base,
    id: "th-2",
    text: "The dashboard should feel like a desk lamp, not a control room.",
    sortOrder: 1,
    groupId: null,
    createdAt: "2026-08-05T21:40:00Z",
  },
  {
    ...base,
    id: "th-3",
    text: "Watch the Supabase auth logs closely for the first two days.",
    sortOrder: 0,
    groupId: "gr-1",
    createdAt: "2026-08-06T08:05:00Z",
  },
  {
    ...base,
    id: "th-4",
    title: "Invite copy",
    text: "Keep the beta invite to three sentences: what Compass is, why them, one link.",
    sortOrder: 1,
    groupId: "gr-1",
    createdAt: "2026-08-06T08:11:00Z",
  },
  {
    ...base,
    id: "th-5",
    text: "Ask the first five users what they ignored, not what they liked.",
    sortOrder: 2,
    groupId: null,
    createdAt: "2026-08-07T13:02:00Z",
  },
];

const groups = [{ ...base, id: "gr-1", name: "Launch week", sortOrder: 2, createdAt: "2026-08-06T08:00:00Z" }];

/** The feed with loose thoughts and one named group (dashed cluster). */
export const Feed = () => (
  <div
    className="dashboard"
    style={{ width: 440, height: 460, display: "flex", flexDirection: "column" }}
  >
    <ThoughtLog initialThoughts={thoughts} initialGroups={groups} />
  </div>
);

/** Empty log — the first-run state before any thought is written down. */
export const Empty = () => (
  <div
    className="dashboard"
    style={{ width: 440, height: 220, display: "flex", flexDirection: "column" }}
  >
    <ThoughtLog initialThoughts={[]} initialGroups={[]} />
  </div>
);

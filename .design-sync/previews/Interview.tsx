/* Preview stories for Interview — the one-page project setup screen
   (two-column .setup-grid: 720px form + the five-step progress rail).
   All answers live in internal useState (no prefill props), so the honest
   static states are the blank form in its two entry contexts:
   first run vs "+ New project" (← Back + "View archive (N)").
   The component renders <main class="setup"> itself and sizes to
   min(996px, 100vw - 40px); the host div supplies the page's sand-300
   background the way body:has(.setup) does in the app, and zooms the
   ~996x1150 screen down so the whole sheet fits the 900x700 capture
   viewport instead of being clipped. */
import type { CSSProperties } from "react";
import { Interview } from "compass";

const host: CSSProperties = {
  zoom: 0.56,
  width: 996,
  background: "var(--primary-300)",
  display: "grid",
  justifyItems: "center",
};

/** First run — a brand-new builder planning their first project. */
export const FirstRun = () => (
  <div style={host}>
    <Interview onComplete={() => {}} />
  </div>
);

/** Opened via "+ New project" with archived projects: ← Back (top-left)
    and "View archive (2)" (top-right) frame the same blank sheet. */
export const NewProjectWithArchive = () => (
  <div style={host}>
    <Interview
      onComplete={() => {}}
      onCancel={() => {}}
      archivedCount={2}
      onViewArchive={() => {}}
    />
  </div>
);

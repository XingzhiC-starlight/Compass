/* Preview stories for CSlider — the calm 0–100 fill slider.
   Each named export renders as one labeled cell in the design-system card.
   CSlider is controlled, so each cell wraps it in local state to stay draggable. */
import { useState } from "react";
import { CSlider } from "compass";

function Demo({ initial, accent, label }: { initial: number; accent: string; label: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ width: 300, padding: "12px 0" }}>
      <CSlider value={value} onChange={setValue} accent={accent} ariaLabel={label} />
    </div>
  );
}

/** The slider as the Learning card uses it — lavender accent, mid progress. */
export const LearningProgress = () => (
  <Demo initial={62} accent="var(--accent-learning)" label="Progress for Supabase & RLS" />
);

/** Same control re-accented for the Time module — the accent prop is the whole theming API. */
export const TimeAccent = () => (
  <Demo initial={35} accent="var(--accent-time)" label="Hours logged today" />
);

/** Near-empty and complete, stacked — the two ends of the track. */
export const Extremes = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <Demo initial={5} accent="var(--accent-timeline)" label="Just started" />
    <Demo initial={100} accent="var(--accent-learning)" label="Done" />
  </div>
);

/* Preview stories for AutoTextarea — the auto-growing one-row textarea
   used by every task/thought add + edit field. Cells stage it exactly the
   way TaskPanel hosts it: as the `.task-add` field inside an "adding" row
   of a `.task-list`, on the task bubble's sand background. */
import { AutoTextarea } from "compass";

const noop = () => {};

/* Shared stage: the Daily Task bubble's add-row context. */
function AddRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard" style={{ width: 440 }}>
      <section className="bubble bubble-task">
        <ul className="task-list" style={{ margin: 0 }}>
          <li className="task-item task-add-row adding">{children}</li>
        </ul>
      </section>
    </div>
  );
}

/** One-line state — a short task mid-typing in the add row. */
export const SingleLine = () => (
  <AddRow>
    <AutoTextarea
      className="task-add"
      value="Draft beta invite email"
      onChange={noop}
    />
  </AddRow>
);

/** Auto-grow — a longer thought wraps and the field expands line by line. */
export const MultiLine = () => (
  <AddRow>
    <AutoTextarea
      className="task-add"
      value={
        "Walk the whole beta onboarding once as a new user: Google sign-in, the interview, first task, first logged hour — note every place the copy feels rushed."
      }
      onChange={noop}
    />
  </AddRow>
);

/** Empty with placeholder — the state right after clicking "+ Add a task". */
export const Placeholder = () => (
  <AddRow>
    <AutoTextarea
      className="task-add"
      value=""
      placeholder="Type a task, press Enter…"
      onChange={noop}
    />
  </AddRow>
);

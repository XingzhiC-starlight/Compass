## §0 About this document

Code: `scripts/docs-check.mjs`

The files in `docs/spec/`, one per section, are the ratified description of Compass as built
and accepted — behavior, screens, data and the rules the code keeps. They describe the
present only: no intentions, no history, no state of git.

- Design choices — color, typography, shape, spacing, sizing, elevation, motion — are
  ratified in `DESIGN-SYSTEM.md`.
- A pull request that changes behavior updates the sections it changes in the same pull
  request. Ideas not yet built are listed in `docs/ideas.md`; how agents work on the code is
  in `AGENTS.md`.
- Section numbers (`§N`) are permanent: new material is appended, never renumbered.
  Load-bearing clauses carry stable IDs — invariants `I1…` in §4, design rules `D1…` in
  `DESIGN-SYSTEM.md` — so code and tests can cite them for years.
- Each section is one file, `docs/spec/<NN>-<slug>.md`, whose one `## §N` heading matches the
  number in its name. Code and docs cite a section as `spec §N`, or `§N` where it cannot be
  read as a design section (`DS §N`), and an invariant by its ID alone. Under its heading, a
  `Code:` line names the files the section describes and the invariants they keep; the docs
  check fails when one of those files is gone.
- A fact that was verified on a date (a production check, a dashboard setting) carries that
  date inside a table. Headings never carry dates.
- §21 holds the architecture a rebuild keeps: the layers, who owns which state, the seam's
  operations and the flows.
- Whether these documents alone are enough to rebuild Compass is measured, not assumed: the
  spec-rebuild-quiz skill (`.claude/skills/spec-rebuild-quiz/`) has a reader who sees only
  the documents answer its questions, and a grader check each answer against the code. An
  answer that is wrong or missing is a defect in the spec, fixed in the section that owns
  the behavior.

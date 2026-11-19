# Building with Compass

**Setup — no provider.** Components are self-contained React (`window.Compass`); nothing reads
context. Two hosting rules:

1. List/row chrome for the dashboard modules (TimeCard, TimelineCard, LearningCard, TaskPanel,
   ThoughtLog) only styles under a `.dashboard` ancestor — wrap them:
   `<div className="dashboard">…</div>`. The cards (`.bubble` roots) have no intrinsic height;
   give the wrapper `display: grid` and a fixed size to stretch one, or place several in your own
   grid. `Sidebar` needs no wrapper (its `.sidebar` styles are top-level) — host it as a
   ~220px-wide column.
2. The shipped stylesheet styles `body` itself: `background: var(--bg)` and a centering
   `display: grid; place-items: center`. Your app root is centered by default — override on your
   own root when you need full-bleed layouts.

**Styling idiom: CSS custom properties, never hardcoded colors.** Style your own layout glue with
these tokens (they're all defined in the `styles.css` closure):

| Role | Tokens |
|---|---|
| Ground | `--bg`, `--card`, `--surface`, `--sidebar-bg`; warm-sand ramp `--primary-25`…`--primary-900` (25–100 washes, 600–800 text-strength) |
| Text | `--text`, `--text-muted` |
| Module accents | `--accent-time`, `--accent-timeline`, `--accent-learning`, `--accent-task`; per-module wash `--bg-time/-timeline/-learning/-task`, edge `--edge-time/-timeline/-learning/-task`, dark ink `--ink-timeline`, `--ink-learning` |
| Forms | `--surface-input` (+`-hover`,`-disabled`), `--border-input` (+`-hover`,`-disabled`), `--focus-ring-primary-soft` |
| Shape & elevation | `--r-bubble` (cards), `--r-pill`, `--r-input`; `--shadow-rest`, `--shadow-hover` |
| Rhythm | `--space-1`…`--space-7` |
| Type | `--font-heading` (Manrope — titles), `--font-body` (Lexend Deca — copy), `--font-label` (Lexend Exa — uppercase eyebrows), `--font-metric` (numbers), `--font-task` / `--font-thought` (Libre Baskerville — task and thought-log prose ONLY) |

**Data & interactivity.** Components take full row objects — every field in `<Name>.d.ts` matters
(`id`, `projectId`, `userId`, `sortOrder`, `createdAt`, …). Write-callbacks persist to the app's
backend and are inert in designs — pass `() => {}`. There is no `Dashboard` shell in the bundle
(it self-fetches data): compose dashboards yourself from the cards.

**Where the truth lives.** Before styling, read `styles.css` and its imports (`fonts/fonts.css`,
`_ds_bundle.css` — all tokens and every component class). Per-component API:
`components/<group>/<Name>/<Name>.d.ts`; usage patterns: `<Name>.prompt.md`.

**Idiomatic build:**

```jsx
const items = [{ id: "li-1", projectId: "p1", userId: "u1", name: "Supabase & RLS",
  sortOrder: 0, progressPct: 55, isFocus: true, createdAt: "2026-08-01T09:00:00Z" }];

<div style={{ background: "var(--bg)", padding: "var(--space-5)", display: "grid", gap: "var(--space-4)" }}>
  <div className="dashboard" style={{ width: 380, display: "grid" }}>
    <LearningCard items={items} depth={false} onToggle={() => {}} />
  </div>
</div>
```

## §15 Landing page

Code: `src/landing/`, `src/styles/landing.css`

The public marketing page shown to signed-out visitors (§2). The layout is fluid — no width
media queries; type and grid scale with the viewport — and the one pixel breakpoint is the
768 px check the demo makes in JavaScript. Copy is final: a change to it changes this section
in the same pull request. Sections in order:

- **Top bar.** The "Compass" wordmark and a "Log in" pill.
- **Hero.** A headline in two staggered lines, "From scattered tasks" / "to structured
  projects"; the sub-line "A workspace for complex self-directed projects."; the illustration
  `/landing/theme-pic.png` (alt text: "Scattered notes and lists on the left; a person walks
  into a clean structured band of five labeled panels on the right.").
- **Five categories.** Eyebrow "Where am I", then three cards — "Commitment": "Know how much
  time you can realistically put into your work."; "Timeline": "Have a phase-to-phase plan for
  complex projects."; "Learning": "Discover the knowledge gaps before success." Eyebrow "What
  now", then one wide bubble — "Task": "What to do now lives under the structure." — holding
  the nested card "Thought" (singular, on purpose), tagged "A second view of Task": "Thoughts,
  personal reflections, and learned knowledge." Thought has no color of its own and takes
  Task's yellow, so the five categories wear four accents.
- **Product intro.** "A simple workspace for personal project management" / "Clear
  architecture, flexible adjustment, continuous improvement".
- **Demo.** The caption "Click any card to open its detail." above a stage with a fixed
  2952 : 1775 aspect ratio holding four pre-normalized dashboard screenshots
  (`/landing/demo/frame-{summary,depth}-{task,thoughts}.png`), all mounted, one visible,
  cross-faded over 300 ms. Two independent booleans pick the frame: *depth* (summary ⇄ depth)
  and *thoughts* (Task ⇄ Thoughts). Two segmented controls beneath the stage — "Summary" /
  "Depth" and "Task" / "Thoughts" (groups labelled "Summary or depth view" and "Task or
  Thoughts panel") — carry the state in `aria-pressed` and work at every size. Wider than
  768 px, invisible measured hotspot buttons over the three upper cards ("Toggle summary or
  depth view") flip *depth* and one over the panel header ("Switch between Task and Thoughts
  panel") flips *thoughts*; at 768 px and below the hotspots are
  absent and a note reads "Compass is built for desktop — use the controls above to explore."
  The hotspot rectangles are hand-measured percentages of the frame, transcribed in
  `src/landing/landingDemo.ts` (`CARD_RECTS` as left/top/right/bottom, `TOGGLE_RECTS` as
  left/top/width/height) and guarded by a test that checks every rectangle is inside the
  frame and well-formed; the measured values themselves are not pinned by a test, so a wrong
  transcription that stays in bounds passes. The four screenshots were
  normalized to one 2952 × 1775 canvas, top-aligned and bottom-padded with the sampled page
  background; retaking them means normalizing the same way and re-measuring every rect,
  because the cards reflow between views. A rect that looks off is measured again, never
  nudged by eye. The images ship unoptimized; a uniform downscale is
  safe because the rects are percentages.
- **Closing call.** "Start your first project." with the second, larger "Log in" pill, and to
  its right a decorative, `aria-hidden` group of five baseline-aligned shapes, one per
  category accent: an 84 px coral circle (Time), a 56 × 116 px mint arch (Timeline), an 84 px
  lavender quarter-round (Learning), an 84 px yellow square (Task) and a 42 px outlined yellow
  square — Thought as a second view of Task.
- **Footer.** The wordmark "Compass".

Both Log in pills switch to the login screen (§2); the login screen's wordmark returns here.
Under `prefers-reduced-motion`, frames swap without the cross-fade.

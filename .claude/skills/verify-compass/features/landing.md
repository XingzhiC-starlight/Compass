# Landing page

The public page signed-out visitors see: a top bar with Log in, the hero, five categories, the
product intro, an interactive demo of four dashboard pictures switched by two segmented controls
(and, on a wide screen, invisible hotspots), the closing call with a second Log in, and the
footer (spec §15).

## Sub-features

- `ld-sections` the sections in order with their final copy, the hero picture, the decorative shapes, the footer.
- `ld-demo-controls` Summary/Depth and Task/Thoughts pick one of four mounted frames, in aria-pressed.
- `ld-demo-hotspots` wider than 768 px, the card hotspots flip summary/depth and the header one flips Task/Thoughts.
- `ld-demo-narrow` at 768 px and below no hotspots and the desktop note; at 769 px the hotspots return.
- `ld-reduced-motion` the 300 ms cross-fade, and none under reduced motion.
- `ld-log-in-pills` both Log in pills open the login screen; its wordmark returns here.
- `ld-fluid` not driven: "fluid, no width media queries" is a property of the stylesheet; the 768 px demo check is the one breakpoint driven here, and DESIGN-SYSTEM.md's census guards the rest.

## How to get to it (user POV)

- Any visit with no session lands here; the login screen's "Compass" wordmark returns here.

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey needs no account.

Run the whole recipe: `node scripts/verify/verify.mjs journey landing`.

- **`ld-sections`.** Open the landing page. By hand: `open /`, `snapshot`. Shows "Compass" and
  "Log in" in the banner; the heading "From scattered tasks" / "to structured projects"; "A
  workspace for complex self-directed projects."; the picture /landing/theme-pic.png with its
  alt text; "Where am I" with Commitment, Timeline and Learning and their lines; "What now" with
  Task, and Thought tagged "A second view of Task"; "A simple workspace for personal project
  management" and "Clear architecture, flexible adjustment, continuous improvement"; "Click any
  card to open its detail."; "Start your first project." with its Log in; five shapes in an
  `aria-hidden` group; the footer "Compass"; the parts in that
  order from the top (the note gives their positions).
- **`ld-demo-controls`.** Press Depth, Thoughts, Summary, Task. By hand:
  `click --in .landing-seg-row --role button --name Depth`, `snapshot --in .landing-demo`.
  Shows the visible frame `frame-depth-task.png`, `frame-depth-thoughts.png`,
  `frame-summary-thoughts.png`, `frame-summary-task.png` in turn, four frames mounted, and
  `aria-pressed` following.
- **`ld-demo-hotspots`.** Press a card hotspot ("Toggle summary or depth view") and the header
  one ("Switch between Task and Thoughts panel"). By hand:
  `click --role button --name "Toggle summary or depth view" --nth 1`. Shows three card
  hotspots and one header hotspot, each flipping its half of the frame.
- **`ld-demo-narrow`.** Width 768, then 769. By hand: `viewport 768 900`,
  `count --role button --name "Toggle summary or depth view"`. Shows no hotspot and "Compass
  is built for desktop — use the controls above to explore." (`…-768px.png`) with the controls
  still working; at 769 px the hotspots back and the note gone.
- **`ld-reduced-motion`.** Read a frame's transition, then emulate reduced motion. By hand:
  `motion reduce`. Shows `opacity 0.3s`, then no transition (the note gives it).
- **`ld-log-in-pills`.** Top bar Log in, the wordmark, the closing Log in, the wordmark. By hand:
  `click --in .landing-cta --role button --name "Log in" --exact`. Shows the login screen each
  time and the landing page after each wordmark.

## Gotchas

- Signed in, the app shows the dashboard instead: the landing journey uses a fresh visit, and by
  hand `open /` shows it only while signed out.
- "Log in" appears twice; scope it to the banner (`--in .landing-topbar`) or the closing call
  (`--in .landing-cta`).
- The frames cross-fade, so a picture taken right after a press can show two half-faded frames;
  the visible frame is the one with class `visible`.
- The demo's 768 px check is made in JavaScript, so change the viewport before reading the
  hotspots; the page does not need a reload.

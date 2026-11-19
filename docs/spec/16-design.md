## §16 Design

Code: `DESIGN-SYSTEM.md`, `src/styles/` · Keeps: I8, I14

Every visual choice — color, typography, shape, spacing, sizing, elevation, motion — is
ratified in `DESIGN-SYSTEM.md`, with rules `D1`–`D11` and one table per design unit generated
from the stylesheets. Behavior sections above cite a design rule where the behavior depends on
it: numbers render as editable text (I14, D5); the landing is fluid with one 768 px breakpoint
(D7); reduced motion swaps the demo frames instantly (D8); error and empty states are never red
(D9). Any change to a unit is a design change and updates `DESIGN-SYSTEM.md` in the same pull
request.

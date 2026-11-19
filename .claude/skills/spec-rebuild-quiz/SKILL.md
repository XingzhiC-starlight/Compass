---
name: spec-rebuild-quiz
description: Measures whether docs/spec/ and DESIGN-SYSTEM.md alone are enough for a fresh agent to rebuild Compass with the same behavior and the same architecture. A reader confined to the documents answers the questions in questions.md, a grader checks each answer against the code, and every answer that is wrong or missing is a defect in the spec. Reach for it after a change to the spec, to the seam (src/lib/db.ts) or to the gate (src/App.tsx), and whenever the owner asks whether the spec is complete.
---

# Spec rebuild quiz

The spec is complete when a reader who has never seen the code can answer every question in
`questions.md` from the documents, and every answer agrees with the code. The quiz measures
that. It never edits the code: a wrong or missing answer is fixed in the spec.

## Run it

Measure one fixed text. Note the commit the documents are at, and edit nothing in them
while a reader or a grader is running; the pull request names that commit with the result.

1. **Reader.** Spawn one subagent that may read only `docs/spec/*.md`, `docs/ideas.md`,
   `DESIGN-SYSTEM.md`, `README.md` and `AGENTS.md`, in full, and nothing under `src/`,
   `supabase/`, `scripts/`, `browser/` or any config file. Give it `questions.md` whole. It
   answers each question as it would act on it, cites the file and line that supports each
   answer, and writes "NOT IN THE DOCUMENTS" with what is missing where the documents do not
   say. It must not fill a gap from general knowledge of React or Supabase. It writes its
   answers to a scratch file outside the repository. Its brief carries these precision
   rules, because the grader checks every claim: keep every qualifier the documents attach
   to a rule, word for word; do not generalize beyond a sentence, and do not state a rule as
   "everything else" unless the documents do; a fact in a table cell counts as stated, and
   where a row gives an exception to a general sentence the row wins; reproduce a list in
   full; where a behavior section and §21 both state a rule, give the union with both
   citations and note any disagreement; a rule for one case is not a rule for the others;
   and where the documents say two things happen "in parallel", do not turn them into a
   sequence.
2. **Grader.** Spawn one subagent with code access, on a different model when one is
   available. For each answer it reads the code and gives one verdict, each with the code's
   file and line. `MATCH`: the answer is complete enough to rebuild from and every claim in
   it agrees with the code; a correct inference counts as a correct claim. `MISMATCH`: any
   claim, however small, contradicts the code; the grader says whether the claim came from a
   sentence in the documents or from the reader. `NOT IN THE DOCUMENTS`: the answer leaves
   out something a rebuilding agent must know before writing the code; the grader says
   whether the documents state it and the reader missed it. These details do not block a
   `MATCH`, because a rebuild does not need them or the documents give them another way:
   an exact SQL default or policy text that the schema files carry; a type's field list
   when the documents give the columns and the camelCase rule; a return type when the
   answer's shape is stated; a library's event names and which of two subscriptions is
   registered first; whether a null value is sent or omitted when the stored result is the
   same; which of two defined functions a caller uses; the exact code of a pure function
   whose rule is stated. The grader writes a table, one row per question, and the code's
   truth for every mismatch and gap. It is a read-only agent, so the session saves its
   report to a scratch file and says what it kept.
3. **Fix the spec.** Every `MISMATCH` and every `NOT IN THE DOCUMENTS` is a defect in the
   spec. Append or correct the section that owns the behavior (the routing table in
   `AGENTS.md` names it), cite invariants by ID, keep §0's rules, and run
   `npm run docs:check`. Never change a question to fit the documents, and never change a
   document to fit a reader's wrong reading of it: the grader's code line decides. A
   question is removed only when the app no longer does what it asks about.
4. **Repeat** with a fresh reader until every verdict is `MATCH`. Put the first and the last
   table in the pull request, with the commit each was measured at, and say if the reader's
   brief or the grader's rules changed between runs.

## Keep the bank true

A pull request that adds a behavior or a module a rebuild would need adds a question for it.
A question is one a rebuilding agent must answer before it can write the code: ownership,
flow, shape, rule. Questions about copy or sizes belong to the sections that quote them, not
here.

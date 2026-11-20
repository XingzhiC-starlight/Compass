# Rebuild questions

Each question is one a fresh agent must answer correctly before it can rebuild Compass with
the same essential behaviors and the same architecture. Answer every question from the
documents alone. For each, give the answer, then the file and line of the sentence that
supports it. When the documents do not say, write "NOT IN THE DOCUMENTS" and say what is
missing. Never guess from general knowledge of React or Supabase.

1. The seam. Which module is the only one in the app that imports the Supabase client, how do
   screens and cards reach the database, and where does database-free logic live?
2. The seam's operations. List every operation the seam exposes to the screens, grouped as:
   auth and session; redirect and link handling; the project list and the sidebar's data;
   the project payload; projects; phases; learning items; tasks; time; thoughts and groups.
   For each operation say what it reads or writes.
3. State ownership. What state does App own, what does Dashboard own, what does each card
   own, what does the seam keep as module state, and what is stored in localStorage?
4. The gate on a page load. A signed-in person with two live projects opens the app. Which
   seam calls run, in what order, and what decides which screen shows?
5. A project switch. What is re-read, what stays mounted, what key changes, and how is a
   payload from a superseded request dropped?
6. A failed save. What does the seam report and to whom, what does App show, how do the
   sidebar and the cards refresh, what happens when saves are still in flight at the refresh,
   and what happens when the refresh itself cannot reach the server?
7. The dashboard payload. List its fields. For the time series: how many days, what one entry
   holds, and whether a day with no sessions appears.
8. Today's hours. How are they computed from sessions, including a running session? By what
   rule is a session closed at a day's end, and which operations close stale sessions?
9. The queue. Which writes run through a queue in the seam, and why?
10. The setup save. What does the database function take, what does it write in one
    transaction, and what happens when the same identity is sent twice?
11. Sort order. For projects, phases, learning items, tasks, loose thoughts and groups, and
    thoughts inside a group: how is the order number assigned when an item is added, and what
    does a drag-reorder persist?
12. Optimistic or waiting. Which writes change the screen before the save answers, and which
    wait for the answer?
13. Limits. The text limits, where each is enforced (schema, interface, both), and what a
    longer paste does.
14. Saves in flight. How does the app know whether saves are still in flight, and what uses
    that knowledge?
15. Auth changes. How does the app notice that who is signed in changed, as opposed to a token
    refresh, and what fires on a password-recovery event?
16. Pure modules. Which modules hold pure logic (no React, no database), and what does each
    compute?
17. Rows and types. How do the TypeScript types map to the SQL rows, where does the mapping
    live, and which columns does the client never send?
18. Essential or incidental. Which rules must any rebuild keep, and how does a reader tell
    them from details (copy, pixel sizes) that a rebuild may change?
19. Two databases. What decides whether Compass runs over a Supabase project or keeps its
    data on this device, where in the code is that decided, and what happens when the
    configuration is half given? How does a screen learn which it is?
20. The local database. Which calls does the local client answer, and in what shape? How is
    it split between a client, a backend and a pure engine, and what would another holder of
    the data have to provide? Where is the data kept, in what format, and what happens to a
    kept text it cannot read and to a save the storage refuses?
21. No accounts. With the data kept on this device: who is signed in, which screens can the
    gate never show, what does an address shaped like a reset link do, and what does the
    Settings dialog hold?
22. The desktop app. What does the page get that a web page does not, and what is it kept
    from? Where is the data, who reads and writes it, how is a save made safe, and what
    happens to a file that cannot be read? What address does the window show and what serves
    it? What does the menu bar show, and when is it empty?
23. The companion. What is it, how is it opened, and what kind of window is it in a browser
    and in the desktop app? What does it show before and after a press on it, and what can a
    person do there? How does it stay in step with the dashboard in both directions, and
    what does the desktop app do for its window and refuse it?
24. The capture keys and the note. What happens, step by step and in which process, between a
    press of the capture keys in another app and the cursor being in the thought box? When
    exactly does the desktop app send its notification and when does it not, what does it
    say, how is it turned off, and where is that choice kept?
25. The app as downloaded. What goes into the package and what is left out? How is the Mac
    app signed, and why that way? What does a downloaded copy share with one run from the
    source, and what differs? What makes the download, when, and what does it check? What
    makes a release public?

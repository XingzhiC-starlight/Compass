import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useServerState } from "./useServerState";
import {
  startSession,
  stopSession,
  getTodayLoggedSeconds,
  listDailyTime,
  setLoggedSecondsForDate,
  setHoursPlannedPerDay,
  todayDate,
  type DailyTime,
} from "../lib/db";
import type { Project } from "../lib/types";
import { commitmentEyebrow, dayNumber, fmtH } from "./projectTime";
import { isSubmitEnter } from "./keys";
import { parseHoursEdit } from "./hoursEdit";

const WEEKS = 7;


export default function TimeCard({
  project,
  currentPhaseStart,
  remainingDays,
  allPhasesDone,
  initialLoggedSeconds,
  initiallyRunning,
  initialDaily,
  depth,
  onToggle,
  syncVersion = 0,
}: {
  project: Project;
  currentPhaseStart: string;
  remainingDays: number;
  allPhasesDone: boolean;
  initialLoggedSeconds: number;
  initiallyRunning: boolean;
  initialDaily: DailyTime[];
  depth: boolean;
  onToggle: (e: MouseEvent) => void;
  syncVersion?: number;
}) {
  const [loggedSeconds, setLoggedSeconds] = useServerState(initialLoggedSeconds, syncVersion);
  const [running, setRunning] = useServerState(initiallyRunning, syncVersion);
  const [past, setPast] = useServerState<DailyTime[]>(initialDaily.slice(0, -1), syncVersion);
  const [plannedHours, setPlannedHours] = useServerState(project.hoursPlannedPerDay, syncVersion);
  const [glanceEdit, setGlanceEdit] = useState<"none" | "logged" | "plan">("none");
  const [glanceEditText, setGlanceEditText] = useState("");
  const [glanceEditOrig, setGlanceEditOrig] = useState("");
  const [editDate, setEditDate] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editOrig, setEditOrig] = useState("");
  const [todayStr, setTodayStr] = useState(() => todayDate());
  const [histMode, setHistMode] = useState<"days" | "weeks">("days");
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      tick.current = setInterval(() => setLoggedSeconds((s) => s + 1), 1000);
    }
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the setter is useState's, which never changes
  }, [running]);

  const rolling = useRef(false);
  useEffect(() => {
    const id = setInterval(async () => {
      const newDate = todayDate();
      if (newDate === todayStr || rolling.current) return;
      rolling.current = true;
      try {
        if (running) {
          setRunning(false);
          await stopSession();
        }
        const daily = await listDailyTime(49);
        setPast(daily.slice(0, -1));
        setLoggedSeconds(daily[daily.length - 1]?.loggedSeconds ?? 0);
        setTodayStr(newDate);
      } finally {
        rolling.current = false;
      }
    }, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the setters are useState's, which never change
  }, [todayStr, running]);

  async function toggleClock() {
    if (running) {
      setRunning(false);
      await stopSession();
      setLoggedSeconds(await getTodayLoggedSeconds());
    } else {
      setRunning(true);
      const started = await startSession();
      if (!started) setRunning(false);
    }
  }

  const plannedSeconds = plannedHours * 3600;
  const weeklyPlanSeconds = plannedSeconds * 7;
  const dayN = Math.max(1, dayNumber(project.startedAt));
  const pct = (sec: number, plan: number) => (plan > 0 ? Math.round((sec / plan) * 100) : 0);

  function startGlanceEdit(which: "logged" | "plan", e: MouseEvent) {
    e.stopPropagation();
    const text = which === "logged" ? fmtH(loggedSeconds) : String(plannedHours);
    setGlanceEdit(which);
    setGlanceEditText(text);
    setGlanceEditOrig(text);
  }
  async function commitGlanceEdit() {
    const which = glanceEdit;
    setGlanceEdit("none");
    const val = parseHoursEdit(glanceEditOrig, glanceEditText);
    if (val === null) return;
    if (which === "logged") {
      const seconds = Math.round(val * 3600);
      setLoggedSeconds(seconds);
      await setLoggedSecondsForDate(todayStr, seconds);
      if (running && !(await startSession())) setRunning(false);
    } else {
      setPlannedHours(val);
      setHoursPlannedPerDay(val);
    }
  }

  function startHoursEdit(date: string, seconds: number, e: MouseEvent) {
    e.stopPropagation();
    const text = fmtH(seconds);
    setEditDate(date);
    setEditText(text);
    setEditOrig(text);
  }
  function commitHoursEdit() {
    if (editDate === null) return;
    const date = editDate;
    setEditDate(null);
    const val = parseHoursEdit(editOrig, editText);
    if (val === null) return;
    const seconds = Math.round(val * 3600);
    setPast((arr) => arr.map((d) => (d.date === date ? { ...d, loggedSeconds: seconds } : d)));
    setLoggedSecondsForDate(date, seconds);
  }

  const allDays: DailyTime[] = [...past, { date: todayStr, loggedSeconds }];
  const recentDays = allDays.slice(-7);

  const weekN = Math.max(1, Math.ceil(dayN / 7));

  const dayRows = recentDays
    .map((d, i) => ({ ...d, dayNum: dayN - (recentDays.length - 1 - i) }))
    .filter((d) => d.dayNum >= 1);

  const allWeeks = Array.from({ length: WEEKS }, (_, i) => {
    const start = allDays.length - (WEEKS - i) * 7;
    const slice = allDays.slice(Math.max(0, start), start + 7);
    return {
      weekStart: slice[0]?.date ?? "",
      weekEnd: slice[slice.length - 1]?.date ?? "",
      loggedSeconds: slice.reduce((s, d) => s + d.loggedSeconds, 0),
      weekNum: weekN - (WEEKS - 1 - i),
    };
  });
  const weekRows = allWeeks.filter((w) => w.weekNum >= 1);

  const sparkValues =
    histMode === "weeks" ? weekRows.map((w) => w.loggedSeconds) : dayRows.map((d) => d.loggedSeconds);
  const sparkMax =
    histMode === "weeks"
      ? Math.max(weeklyPlanSeconds, ...sparkValues, 1)
      : Math.max(plannedSeconds, ...sparkValues, 1);

  const daysTotal = dayRows.reduce((s, d) => s + d.loggedSeconds, 0);
  const weeksTotal = weekRows.reduce((s, w) => s + w.loggedSeconds, 0);

  return (
    <section className="bubble bubble-time glance-card" onClick={onToggle}>
      <header className="bubble-header">
        <span className="bubble-dot" style={{ background: "var(--accent-time)" }} />
        <h2 className="bubble-title">Commitment</h2>
        <span className="glance-cue" aria-hidden="true">
          {depth ? "▾" : "▸"}
        </span>
      </header>

      <div className="glance">
        <span className="glance-eyebrow">
          {commitmentEyebrow({ currentPhaseStart, remainingDays, allPhasesDone }, plannedHours)}
        </span>

        <div className="glance-hero-row">
          <button
            className="glance-clock"
            type="button"
            onClick={toggleClock}
            aria-label={running ? "Stop work session" : "Start work session"}
          >
            {running ? (
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <rect x="1.5" y="1.5" width="9" height="9" rx="2" />
              </svg>
            ) : (
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 2 L12 7 L3 12 Z" />
              </svg>
            )}
          </button>
          <span className="glance-hero">
            {glanceEdit === "logged" ? (
              <input
                className="glance-hero-input glance-hero-input-narrow"
                autoFocus
                value={glanceEditText}
                onChange={(e) => setGlanceEditText(e.target.value)}
                onBlur={commitGlanceEdit}
                onKeyDown={(e) => {
                  if (isSubmitEnter(e)) { e.preventDefault(); commitGlanceEdit(); }
                  if (e.key === "Escape") setGlanceEdit("none");
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span onClick={(e) => startGlanceEdit("logged", e)}>{fmtH(loggedSeconds)}</span>
            )}
            /
            {glanceEdit === "plan" ? (
              <input
                className="glance-hero-input glance-hero-input-narrow"
                autoFocus
                value={glanceEditText}
                onChange={(e) => setGlanceEditText(e.target.value)}
                onBlur={commitGlanceEdit}
                onKeyDown={(e) => {
                  if (isSubmitEnter(e)) { e.preventDefault(); commitGlanceEdit(); }
                  if (e.key === "Escape") setGlanceEdit("none");
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span onClick={(e) => startGlanceEdit("plan", e)}>{fmtH(plannedSeconds)}h</span>
            )}
          </span>
          <div className="glance-spark" aria-hidden="true">
            {sparkValues.map((sec, i) => (
              <div
                key={i}
                className={"glance-bar" + (histMode === "days" && i === sparkValues.length - 1 ? " today" : "")}
                style={{ height: Math.max(3, (sec / sparkMax) * 36) }}
              />
            ))}
          </div>
        </div>

        <div className="glance-bar-wrap">
          <div
            className="glance-bar-fill"
            style={{
              width: `${Math.min(100, pct(loggedSeconds, plannedSeconds))}%`,
              background: "var(--accent-time)",
            }}
          />
        </div>
      </div>

      {depth && (
        <div className="panel-scroll">
          <div className="col-head">
            <button
              className="hist-toggle"
              type="button"
              onClick={() => setHistMode((m) => (m === "days" ? "weeks" : "days"))}
              title="Switch between day and week history"
            >
              {histMode === "days" ? "Days" : "Weeks"} ⇄
            </button>
            <span style={{ marginLeft: "auto" }}>
              {histMode === "days" ? `/ ${fmtH(plannedSeconds)}h` : `/ ${fmtH(weeklyPlanSeconds)}h`}
            </span>
          </div>

          {histMode === "days" ? (
            <ul className="list">
              {dayRows.map((d, i) => {
                const isToday = i === dayRows.length - 1;
                const dayLabel = isToday ? "Today" : `Day ${d.dayNum}`;
                return (
                  <li className="row" key={d.date || "today"}>
                    <span className="time-date">{dayLabel}</span>
                    {!isToday && editDate === d.date ? (
                      <input
                        className="time-hours-input"
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={commitHoursEdit}
                        onKeyDown={(e) => {
                          if (isSubmitEnter(e)) { e.preventDefault(); commitHoursEdit(); }
                          if (e.key === "Escape") setEditDate(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : isToday ? (
                      <span className="time-hours">{fmtH(d.loggedSeconds)}h</span>
                    ) : (
                      <span
                        className="time-hours editable"
                        title="Click to edit hours"
                        onClick={(e) => startHoursEdit(d.date, d.loggedSeconds, e)}
                      >
                        {fmtH(d.loggedSeconds)}h
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="list">
              {weekRows.map((wk, i) => {
                const weekLabel = i === weekRows.length - 1 ? "This week" : `Week ${wk.weekNum}`;
                return (
                  <li className="row" key={wk.weekStart}>
                    <span className="time-date">{weekLabel}</span>
                    <span className="time-hours">{fmtH(wk.loggedSeconds)}h</span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="time-foot">
            {histMode === "days" ? (
              <>
                <span>
                  {dayRows.length}-day total <b>{fmtH(daysTotal)}h</b>
                </span>
                <span>
                  avg <b>{fmtH(daysTotal / dayRows.length)}h</b>/day
                </span>
              </>
            ) : (
              <>
                <span>
                  {weekRows.length}-week total <b>{fmtH(weeksTotal)}h</b>
                </span>
                <span>
                  avg <b>{fmtH(weeksTotal / weekRows.length)}h</b>/wk
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

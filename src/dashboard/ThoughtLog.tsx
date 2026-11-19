import { useEffect, useRef, useState } from "react";
import { useAddBox } from "./useAddBox";
import { TEXT_LIMITS } from "../lib/limits";
import { useServerState } from "./useServerState";
import {
  addThought,
  updateThought,
  removeThought,
  reorderFeed,
  reorderThoughtsInGroup,
  groupThoughts,
  mergeThoughtsIntoGroup,
  popThoughtsFromGroup,
  ungroupThoughts,
  renameThoughtGroup,
  moveThoughtToGroup,
} from "../lib/db";
import type { Thought, ThoughtGroup } from "../lib/types";
import { reorder } from "./useDragReorder";
import { useEdgeAutoScroll } from "./useEdgeAutoScroll";
import AutoTextarea from "./AutoTextarea";
import { isSubmitEnter } from "./keys";

type FeedItem =
  | { kind: "thought"; thought: Thought }
  | { kind: "group"; group: ThoughtGroup; thoughts: Thought[] };

function buildFeed(thoughts: Thought[], groups: ThoughtGroup[]): FeedItem[] {
  const byGroup = new Map<string, Thought[]>();
  for (const g of groups) byGroup.set(g.id, []);
  for (const t of thoughts) {
    if (t.groupId && byGroup.has(t.groupId)) {
      byGroup.get(t.groupId)!.push(t);
    }
  }
  for (const [, arr] of byGroup) arr.sort((a, b) => a.sortOrder - b.sortOrder);

  const items: FeedItem[] = [];
  for (const t of thoughts.filter((x) => x.groupId === null)) {
    items.push({ kind: "thought", thought: t });
  }
  for (const g of groups) {
    items.push({ kind: "group", group: g, thoughts: byGroup.get(g.id) ?? [] });
  }
  items.sort((a, b) => {
    const oa = a.kind === "thought" ? a.thought.sortOrder : a.group.sortOrder;
    const ob = b.kind === "thought" ? b.thought.sortOrder : b.group.sortOrder;
    return oa - ob;
  });
  return items;
}

function Grip({ ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 8 14" aria-hidden="true" className="th-handle" {...props}>
      <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
      <circle cx="2" cy="7" r="1.2" /><circle cx="6" cy="7" r="1.2" />
      <circle cx="2" cy="12" r="1.2" /><circle cx="6" cy="12" r="1.2" />
    </svg>
  );
}

function PopOutIcon() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className="th-pop-icon">
      <path d="M6 8 L12 2 M8 2 H12 V6" />
      <path d="M11 9 V12 H2 V3 H5" />
    </svg>
  );
}

interface ThoughtRowProps {
  thought: Thought;
  index: number;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => Promise<boolean>;
  onEditTitle: (id: string, title: string) => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dropBefore: boolean;
  dropAfter: boolean;
  onGripDown: () => void;
  onGripUp: () => void;
  onPopOut?: (id: string) => void;
}

function ThoughtRow({
  thought,
  selected,
  onSelect,
  onDelete,
  onEdit,
  onEditTitle,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dropBefore,
  dropAfter,
  onGripDown,
  onGripUp,
  onPopOut,
}: ThoughtRowProps) {
  const [editing, setEditingState] = useState(false);
  const editingRef = useRef(false);
  const setEditing = (on: boolean) => {
    editingRef.current = on;
    setEditingState(on);
  };
  const [editText, setEditText] = useState(thought.text);
  const [editFocus, setEditFocus] = useState(true);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; // on every mount — StrictMode mounts twice in development
    return () => {
      mounted.current = false;
    };
  }, []);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(thought.title ?? "");

  async function commitEdit() {
    if (!editingRef.current) return;
    const text = editText.trim();
    setEditing(false);
    if (!(text && text !== thought.text)) {
      setEditText(thought.text);
      return;
    }
    const saved = await onEdit(thought.id, text);
    if (!saved && mounted.current && !editingRef.current) {
      setEditText(text);
      setEditFocus(false);
      setEditing(true);
    }
  }

  function commitTitle() {
    const title = titleText.trim();
    setEditingTitle(false);
    if (title !== (thought.title ?? "")) onEditTitle(thought.id, title);
  }

  const cls =
    "th-row" +
    (selected ? " th-selected" : "") +
    (dropBefore ? " drop-before" : "") +
    (dropAfter ? " drop-after" : "");

  return (
    <li
      className={cls}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <input
        type="checkbox"
        className="th-check"
        checked={selected}
        onChange={(e) => onSelect(thought.id, e.target.checked)}
        aria-label="Select thought"
        onClick={(e) => e.stopPropagation()}
      />
      <Grip onMouseDown={onGripDown} onMouseUp={onGripUp} />

      <div className="th-body">
        {editingTitle ? (
          <input
            className="th-title th-title-input"
            autoFocus
            maxLength={TEXT_LIMITS.thoughtTitle}
            placeholder="Add a title…"
            value={titleText}
            onChange={(e) => setTitleText(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (isSubmitEnter(e)) { e.preventDefault(); commitTitle(); }
              if (e.key === "Escape") { setEditingTitle(false); setTitleText(thought.title ?? ""); }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={"th-title" + (thought.title ? "" : " th-title-empty")}
            title="Click to edit title"
            onClick={() => { setEditingTitle(true); setTitleText(thought.title ?? ""); }}
          >
            {thought.title || "Add a title…"}
          </span>
        )}
        {editing ? (
          <AutoTextarea
            className="th-text th-text-input"
            autoFocus={editFocus}
            maxLength={TEXT_LIMITS.thoughtText}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (isSubmitEnter(e) && !e.shiftKey) { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") { setEditing(false); setEditText(thought.text); }
            }}
          />
        ) : (
          <p
            className="th-text"
            onClick={() => { setEditFocus(true); setEditing(true); setEditText(thought.text); }}
          >
            {thought.text}
          </p>
        )}
      </div>

      {onPopOut && (
        <button
          type="button"
          className="th-pop"
          aria-label="Pop thought out of group"
          title="Pop out of group"
          onClick={(e) => { e.stopPropagation(); onPopOut(thought.id); }}
        >
          <PopOutIcon />
        </button>
      )}
      <button
        type="button"
        className="th-del"
        aria-label="Delete thought"
        onClick={() => onDelete(thought.id)}
      >
        ×
      </button>
    </li>
  );
}

interface Props {
  initialThoughts: Thought[];
  initialGroups: ThoughtGroup[];
  syncVersion?: number;
}

export default function ThoughtLog({ initialThoughts, initialGroups, syncVersion = 0 }: Props) {
  const [thoughts, setThoughts] = useServerState<Thought[]>(initialThoughts, syncVersion);
  const [groups, setGroups] = useServerState<ThoughtGroup[]>(initialGroups, syncVersion);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prunedAt, setPrunedAt] = useState(syncVersion);
  if (prunedAt !== syncVersion) {
    setPrunedAt(syncVersion);
    const alive = new Set(initialThoughts.map((t) => t.id));
    setSelected((s) => new Set([...s].filter((id) => alive.has(id))));
  }
  const add = useAddBox(addThought, (created: Thought) => setThoughts((arr) => [...arr, created]));

  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const [grabbedKind, setGrabbedKind] = useState<"thought" | "group" | null>(null);
  const feedDragFrom = useRef<{ id: string; kind: "thought" | "group" } | null>(null);
  const [feedDropAt, setFeedDropAt] = useState<{ index: number; after: boolean } | null>(null);

  const [groupGrabbedId, setGroupGrabbedId] = useState<string | null>(null);
  const [groupGrabbedIn, setGroupGrabbedIn] = useState<string | null>(null);
  const groupDragFrom = useRef<string | null>(null);
  const [groupDropAt, setGroupDropAt] = useState<{
    groupId: string;
    index: number;
    after: boolean;
  } | null>(null);

  const feed = buildFeed(thoughts, groups);

  const feedRef = useRef<HTMLUListElement>(null);
  const edgeScroll = useEdgeAutoScroll(feedRef);

  function toggleSelect(id: string, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleGroupSelect(memberIds: string[], checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      memberIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function getFullySelectedGroups(): ThoughtGroup[] {
    return groups
      .filter((g) => {
        const ids = thoughts.filter((t) => t.groupId === g.id).map((t) => t.id);
        return ids.length > 0 && ids.every((id) => selected.has(id));
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function handleEdit(id: string, text: string): Promise<boolean> {
    setThoughts((arr) => arr.map((t) => (t.id === id ? { ...t, text } : t)));
    return updateThought(id, { text });
  }

  function handleEditTitle(id: string, title: string) {
    setThoughts((arr) => arr.map((t) => (t.id === id ? { ...t, title } : t)));
    updateThought(id, { title });
  }

  function handleDelete(id: string) {
    setThoughts((arr) => arr.filter((t) => t.id !== id));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    removeThought(id);
  }

  async function handleGroup() {
    const selectedIds = [...selected];
    if (selectedIds.length < 2) return;

    const target = getFullySelectedGroups()[0] ?? null;

    clearSelection();

    if (target) {
      const idsToMerge = selectedIds.filter(
        (id) => thoughts.find((t) => t.id === id)?.groupId !== target.id,
      );
      if (!idsToMerge.length) return;
      const snap = await mergeThoughtsIntoGroup(target.id, idsToMerge);
      if (!snap) return;
      setThoughts(snap.thoughts);
      setGroups(snap.groups);
      return;
    }

    const snap = await groupThoughts(selectedIds, "");
    if (!snap) return;
    setThoughts(snap.thoughts);
    setGroups(snap.groups);
    setRenamingGroupId(snap.group.id);
    setRenameText("");
  }

  async function handleDegroup() {
    const ids = [...selected].filter((id) => thoughts.find((t) => t.id === id)?.groupId);
    if (!ids.length) return;
    clearSelection();
    const snap = await popThoughtsFromGroup(ids);
    if (!snap) return;
    setThoughts(snap.thoughts);
    setGroups(snap.groups);
  }

  async function handlePopOut(id: string) {
    const snap = await popThoughtsFromGroup([id]);
    if (!snap) return;
    setThoughts(snap.thoughts);
    setGroups(snap.groups);
  }

  async function handleUngroup(groupId: string) {
    const snap = await ungroupThoughts(groupId);
    if (!snap) return;
    setThoughts(snap.thoughts);
    setGroups(snap.groups);
  }

  async function commitRenameGroup(id: string) {
    const name = renameText.trim();
    setRenamingGroupId(null);
    if (!name) return;
    await renameThoughtGroup(id, name);
    setGroups((arr) => arr.map((g) => (g.id === id ? { ...g, name } : g)));
  }

  const isAfter = (e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY - rect.top > rect.height / 2;
  };

  function onFeedDragStart(_index: number, id: string, kind: "thought" | "group") {
    if (grabbedId !== id || grabbedKind !== kind) return;
    feedDragFrom.current = { id, kind };
    edgeScroll.start();
    setGrabbedId(id);
    setGrabbedKind(kind);
  }

  function onFeedDragOver(index: number, e: React.DragEvent) {
    if (feedDragFrom.current === null) return;
    e.preventDefault();
    setFeedDropAt({ index, after: isAfter(e) });
  }

  function onFeedDrop(index: number, e: React.DragEvent) {
    const held = feedDragFrom.current;
    if (held === null) return;
    e.preventDefault();
    const from = feed.findIndex((item) =>
      item.kind === held.kind && (item.kind === "thought" ? item.thought.id : item.group.id) === held.id,
    );
    if (from === -1) return endFeedDrag();
    const after = isAfter(e);
    const to = index + (after ? 1 : 0);
    const next = reorder(feed, from, to);
    const place = new Map(next.map((item, i) => [item.kind === "thought" ? item.thought.id : item.group.id, i]));
    const newThoughts = thoughts.map((t) => (t.groupId === null && place.has(t.id) ? { ...t, sortOrder: place.get(t.id)! } : t));
    const newGroups = groups.map((g) => (place.has(g.id) ? { ...g, sortOrder: place.get(g.id)! } : g));
    setThoughts(newThoughts);
    setGroups(newGroups);
    reorderFeed(
      next.map((item) => ({
        id: item.kind === "thought" ? item.thought.id : item.group.id,
        kind: item.kind,
      })),
    );
    endFeedDrag();
  }

  function endFeedDrag() {
    feedDragFrom.current = null;
    setGrabbedId(null);
    setGrabbedKind(null);
    setFeedDropAt(null);
    edgeScroll.stop();
  }

  function onGroupDragStart(groupId: string, _index: number, thoughtId: string) {
    if (groupGrabbedId !== thoughtId || groupGrabbedIn !== groupId) return;
    groupDragFrom.current = thoughtId;
    edgeScroll.start();
    setGroupGrabbedId(thoughtId);
    setGroupGrabbedIn(groupId);
  }

  function onGroupDragOver(groupId: string, index: number, e: React.DragEvent) {
    if (groupDragFrom.current === null) return;
    e.preventDefault();
    e.stopPropagation();
    setGroupDropAt({ groupId, index, after: isAfter(e) });
  }

  function onGroupDrop(groupId: string, index: number, e: React.DragEvent) {
    const held = groupDragFrom.current;
    if (held === null) return;
    e.preventDefault();
    e.stopPropagation();
    const after = isAfter(e);
    const to = index + (after ? 1 : 0);
    const groupThoughtItems = thoughts
      .filter((t) => t.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const from = groupThoughtItems.findIndex((t) => t.id === held);
    if (from === -1) return endGroupDrag();
    const next = reorder(groupThoughtItems, from, to);
    const newThoughts = thoughts.map((t) => {
      const ni = next.findIndex((x) => x.id === t.id);
      return ni >= 0 ? { ...t, sortOrder: ni } : t;
    });
    setThoughts(newThoughts);
    reorderThoughtsInGroup(groupId, next.map((t) => t.id));
    endGroupDrag();
  }

  function endGroupDrag() {
    groupDragFrom.current = null;
    setGroupGrabbedId(null);
    setGroupGrabbedIn(null);
    setGroupDropAt(null);
    edgeScroll.stop();
  }

  function onGroupHeaderDragOver(e: React.DragEvent) {
    if (grabbedKind === "thought") { e.preventDefault(); e.stopPropagation(); }
  }

  async function onGroupHeaderDrop(groupId: string, e: React.DragEvent) {
    if (grabbedKind !== "thought" || !grabbedId) return;
    e.preventDefault();
    e.stopPropagation();
    const thoughtId = grabbedId;
    await moveThoughtToGroup(thoughtId, groupId);
    setThoughts((arr) =>
      arr.map((t) => (t.id === thoughtId ? { ...t, groupId } : t)),
    );
    endFeedDrag();
  }

  const totalSelected = selected.size;
  const showActionBar = totalSelected >= 2;
  const mergeTarget = getFullySelectedGroups()[0] ?? null;
  const canMerge =
    !!mergeTarget &&
    [...selected].some((id) => thoughts.find((t) => t.id === id)?.groupId !== mergeTarget.id);
  const hasGroupedSelected = [...selected].some(
    (id) => thoughts.find((t) => t.id === id)?.groupId,
  );

  return (
    <div className="th-log">
      <ul className="th-feed" ref={feedRef}>
        {feed.map((item, fi) => {
          if (item.kind === "thought") {
            const t = item.thought;
            const isGrabbed = grabbedId === t.id && grabbedKind === "thought";
            const dropBefore = feedDropAt?.index === fi && !feedDropAt.after;
            const dropAfter = feedDropAt?.index === fi && feedDropAt.after;
            return (
              <ThoughtRow
                key={t.id}
                thought={t}
                index={fi}
                selected={selected.has(t.id)}
                onSelect={toggleSelect}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onEditTitle={handleEditTitle}
                draggable={grabbedId === t.id}
                onDragStart={() => onFeedDragStart(fi, t.id, "thought")}
                onDragOver={(e) => onFeedDragOver(fi, e)}
                onDrop={(e) => onFeedDrop(fi, e)}
                onDragEnd={endFeedDrag}
                dropBefore={dropBefore}
                dropAfter={dropAfter}
                onGripDown={() => { setGrabbedId(t.id); setGrabbedKind("thought"); }}
                onGripUp={() => { if (!isGrabbed) { setGrabbedId(null); setGrabbedKind(null); } }}
              />
            );
          }

          const { group, thoughts: gThoughts } = item;
          const isGroupGrabbed = grabbedId === group.id && grabbedKind === "group";
          const dropBefore = feedDropAt?.index === fi && !feedDropAt.after;
          const dropAfter = feedDropAt?.index === fi && feedDropAt.after;
          const groupMemberIds = gThoughts.map((t) => t.id);
          const allSelected = groupMemberIds.length > 0 && groupMemberIds.every((id) => selected.has(id));
          const someSelected = groupMemberIds.some((id) => selected.has(id));

          return (
            <li
              key={group.id}
              className={
                "th-group" +
                (isGroupGrabbed ? " th-dragging" : "") +
                (allSelected ? " th-group-selected" : "") +
                (dropBefore ? " drop-before" : "") +
                (dropAfter ? " drop-after" : "")
              }
              draggable={grabbedId === group.id}
              onDragStart={() => onFeedDragStart(fi, group.id, "group")}
              onDragOver={(e) => onFeedDragOver(fi, e)}
              onDrop={(e) => onFeedDrop(fi, e)}
              onDragEnd={endFeedDrag}
            >
              <div
                className="th-group-header"
                onDragOver={onGroupHeaderDragOver}
                onDrop={(e) => onGroupHeaderDrop(group.id, e)}
              >
                <input
                  type="checkbox"
                  className="th-group-check"
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  checked={allSelected}
                  onChange={(e) => toggleGroupSelect(groupMemberIds, e.target.checked)}
                  aria-label="Select all thoughts in this group"
                  onClick={(e) => e.stopPropagation()}
                />
                <Grip
                  onMouseDown={() => { setGrabbedId(group.id); setGrabbedKind("group"); }}
                  onMouseUp={() => { if (!isGroupGrabbed) { setGrabbedId(null); setGrabbedKind(null); } }}
                />
                <span className="th-group-chip">
                  {gThoughts.length} {gThoughts.length === 1 ? "thought" : "thoughts"}
                </span>
                {renamingGroupId === group.id ? (
                  <input
                    className="th-group-name-input"
                    autoFocus
                    maxLength={TEXT_LIMITS.thoughtGroupName}
                    placeholder="Name this group…"
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => commitRenameGroup(group.id)}
                    onKeyDown={(e) => {
                      if (isSubmitEnter(e)) commitRenameGroup(group.id);
                      if (e.key === "Escape") setRenamingGroupId(null);
                    }}
                  />
                ) : (
                  <span
                    className="th-group-name"
                    onClick={() => { setRenamingGroupId(group.id); setRenameText(group.name); }}
                    title="Click to rename"
                  >
                    {group.name || <em>Untitled group</em>}
                  </span>
                )}
                <button
                  type="button"
                  className="th-ungroup"
                  onClick={() => handleUngroup(group.id)}
                >
                  Ungroup
                </button>
              </div>

              <ul className="th-group-list">
                {gThoughts.map((t, gi) => {
                  const isGrabbed = groupGrabbedId === t.id && groupGrabbedIn === group.id;
                  const gDropBefore = groupDropAt?.groupId === group.id && groupDropAt.index === gi && !groupDropAt.after;
                  const gDropAfter = groupDropAt?.groupId === group.id && groupDropAt.index === gi && groupDropAt.after;
                  return (
                    <ThoughtRow
                      key={t.id}
                      thought={t}
                      index={gi}
                      selected={selected.has(t.id)}
                      onSelect={toggleSelect}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                      onEditTitle={handleEditTitle}
                      draggable={groupGrabbedId === t.id}
                      onDragStart={() => onGroupDragStart(group.id, gi, t.id)}
                      onDragOver={(e) => onGroupDragOver(group.id, gi, e)}
                      onDrop={(e) => onGroupDrop(group.id, gi, e)}
                      onDragEnd={endGroupDrag}
                      dropBefore={gDropBefore}
                      dropAfter={gDropAfter}
                      onGripDown={() => { setGroupGrabbedId(t.id); setGroupGrabbedIn(group.id); }}
                      onGripUp={() => { if (!isGrabbed) { setGroupGrabbedId(null); setGroupGrabbedIn(null); } }}
                      onPopOut={handlePopOut}
                    />
                  );
                })}
              </ul>
            </li>
          );
        })}

        <li className={"th-row th-add-row" + (add.adding ? " adding" : "")}>
          {add.adding ? (
            <AutoTextarea
              className={"th-add-input" + (add.slow ? " saving-slow" : "")}
              autoFocus
              placeholder="What's on your mind? Press Enter to add…"
              maxLength={TEXT_LIMITS.thoughtText}
              value={add.text}
              {...add.fieldProps}
              onChange={(e) => add.change(e.target.value)}
              onBlur={add.commit}
              onKeyDown={(e) => {
                if (isSubmitEnter(e)) { e.preventDefault(); add.commit(); }
                if (e.key === "Escape") add.cancel();
              }}
            />
          ) : (
            <button type="button" className="th-add-btn" onClick={add.open}>
              + Add a thought
            </button>
          )}
        </li>
      </ul>

      {showActionBar && (
        <div className="th-action-bar">
          <span className="th-action-count">{totalSelected} selected</span>
          {hasGroupedSelected && (
            <button
              type="button"
              className="th-action-btn th-action-btn-ghost"
              onClick={handleDegroup}
              title="Remove the selected thoughts from their group"
            >
              De-group
            </button>
          )}
          <button type="button" className="th-action-btn" onClick={handleGroup}>
            {canMerge ? "Merge" : "Group"}
          </button>
          <button type="button" className="th-action-clear" onClick={clearSelection}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

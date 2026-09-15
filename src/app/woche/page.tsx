"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { getWeek, type WeekResult, type WeekGoal, type WeekEntry } from "@/lib/storage/week";
import { recordEntry } from "@/lib/storage/entries";

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });
const DAY_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function isComplete(goal: WeekGoal, entry: WeekEntry | null): boolean {
  if (!entry) return false;
  if (goal.type === "boolean") return entry.done;
  return (entry.value ?? 0) >= (goal.targetValue ?? Infinity);
}

export default function WeekPage() {
  const [data, setData] = useState<WeekResult | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const todayColRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setData(await getWeek());
  }, []);

  useEffect(() => {
    getWeek().then(setData);
  }, []);

  // The visible range is Mon-Sun, and today can land anywhere in it (unlike
  // the Heatmap's "always scroll to the end") — bring today's own column
  // into view instead of assuming a direction.
  useEffect(() => {
    todayColRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [data]);

  async function saveEntry(goalId: string, date: string, done: boolean, value?: number) {
    await recordEntry({ goalId, date, done, value });
    load();
  }

  if (!data) return <main className="px-6 py-10 text-muted-foreground">Lädt…</main>;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
      <h1 className="font-heading text-3xl">Diese Woche</h1>

      {data.goals.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Ziele angelegt.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card backdrop-blur-xl">
          {/*
            CSS grid, not an HTML table: `position: sticky` on a <td>/<th>
            inside a <table> is unreliable in Safari — confirmed on real
            iOS Safari, where the sticky header and first-column cells
            rendered as one oversized floating box instead of staying
            confined to their own row. A grid with the goal-name column
            reused on every row via `sticky left-0` behaves correctly
            across browsers, the same "frozen first column" a spreadsheet
            gives you when scrolling right.

            The horizontal padding lives on the sticky column's own left
            edge and the last day column's right edge, not on this
            overflow-x-auto div: a scroll container's own padding is part
            of its scrollable area, so scrolled-past content can slide
            into it and stay paintable there — confirmed via
            elementFromPoint() at a point inside the old p-4 gutter, which
            hit a day column that should already have scrolled out of
            view. Zero padding here means there's no such gutter for
            anything to reappear in; the outer div (not a scroll
            container) keeps the visual border/corners/background.
          */}
          <div className="overflow-x-auto py-4">
            <div className="grid min-w-[644px] grid-cols-[140px_repeat(7,72px)]">
              {/* Sticky+opaque only below md: the grid's ~644px min-width
                  never needs horizontal scroll at md and up inside this
                  max-w-4xl page, so keeping it sticky there just paints an
                  opaque block over the glass card for no functional reason.
                  The fill is --card's own hue/lightness at full opacity, not
                  --popover — that token is a full step darker and slightly
                  less saturated, which read as a mismatched black box glued
                  onto the card instead of "the same glass, just less
                  see-through here" (feedback after shipping the bg-popover
                  version). Full opacity (not backdrop-blur) still avoids the
                  original double-blur bug: stacking another blur on the
                  already-blurred card compounded into a visibly flat patch. */}
              <div className="sticky left-0 z-10 bg-[oklch(0.32_0.02_225)] py-0 pr-2 pb-3 pl-4 text-left text-sm font-medium text-muted-foreground md:static md:bg-transparent md:pl-2">
                Ziel
              </div>
              {data.days.map((day, i) => (
                <div
                  key={day}
                  ref={day === today ? todayColRef : undefined}
                  className={`px-2 pb-3 text-center text-xs font-normal ${i === data.days.length - 1 ? "pr-4 md:pr-2" : ""} ${
                    day === today ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div>{WEEKDAY_FORMAT.format(new Date(day + "T00:00:00Z"))}</div>
                  <div className="font-mono">{DAY_FORMAT.format(new Date(day + "T00:00:00Z"))}</div>
                </div>
              ))}

              {data.goals.map((goal) => (
                <Fragment key={goal.id}>
                  <div className="sticky left-0 z-10 flex items-center border-t border-border/60 bg-[oklch(0.32_0.02_225)] py-2 pr-3 pl-4 md:static md:bg-transparent md:pl-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {goal.icon && <span className="text-base leading-none">{goal.icon}</span>}
                      {goal.title}
                    </span>
                  </div>
                  {data.days.map((day, i) => (
                    <div
                      key={day}
                      className={`border-t border-border/60 p-1 text-center ${i === data.days.length - 1 ? "pr-4 md:pr-1" : ""}`}
                    >
                      <WeekCell
                        key={`${goal.entries[day]?.done ?? ""}-${goal.entries[day]?.value ?? ""}`}
                        goal={goal}
                        date={day}
                        entry={goal.entries[day]}
                        isFuture={day > today}
                        isToday={day === today}
                        onSave={saveEntry}
                      />
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function WeekCell({
  goal,
  date,
  entry,
  isFuture,
  isToday,
  onSave,
}: {
  goal: WeekGoal;
  date: string;
  entry: WeekEntry | null;
  isFuture: boolean;
  isToday: boolean;
  onSave: (goalId: string, date: string, done: boolean, value?: number) => void;
}) {
  // Remounted via `key` whenever entry changes (see caller), so the initial
  // state below always reflects the latest saved value without an effect.
  const [value, setValue] = useState(entry?.value != null ? String(entry.value) : "");
  const complete = isComplete(goal, entry);

  const ringClass = isToday ? "ring-1 ring-primary/40" : "";

  if (goal.type === "boolean") {
    return (
      <button
        type="button"
        disabled={isFuture}
        onClick={() => onSave(goal.id, date, !complete)}
        className={`mx-auto flex size-10 items-center justify-center rounded-full border transition-colors disabled:opacity-30 ${ringClass} ${
          complete ? "border-celebrate bg-celebrate text-celebrate-foreground" : "border-border bg-muted/40 hover:bg-muted"
        }`}
      >
        {complete && <Check className="size-4" />}
      </button>
    );
  }

  return (
    <input
      type="number"
      disabled={isFuture}
      min={0}
      step={goal.step}
      value={value}
      onChange={(e) => {
        // The min attribute only affects the spinner arrows, not
        // typed/pasted input, so negative values are clamped here too.
        const raw = e.target.value;
        setValue(Number(raw) < 0 ? "0" : raw);
      }}
      onBlur={() => {
        if (!value) return;
        const numeric = Number(value);
        onSave(goal.id, date, numeric >= (goal.targetValue ?? 0), numeric);
      }}
      className={`h-10 w-14 rounded-md border bg-transparent px-1 text-center font-mono text-sm outline-none disabled:opacity-30 ${ringClass} ${
        complete ? "border-celebrate text-celebrate" : "border-border"
      }`}
    />
  );
}

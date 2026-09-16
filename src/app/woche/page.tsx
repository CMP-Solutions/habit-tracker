"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { getWeek, type WeekResult, type WeekGoal, type WeekEntry } from "@/lib/storage/week";
import { recordEntry } from "@/lib/storage/entries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
        <div className="flex overflow-hidden rounded-xl border bg-card backdrop-blur-xl">
          {/*
            Two independent columns instead of one grid with a sticky first
            column. A sticky cell is an overlay painted OVER the scrolling
            content behind it, which forced it to carry an opaque fill that
            had to color-match whatever happens to show through the
            translucent card at that spot — the card's tint blends with the
            animated aurora background live, so a static color could get
            close but never stay pixel-identical (visible as a faint box
            across three rounds of color fixes).

            Splitting into a static flex column (goal names) next to an
            independently scrolling one (day cells) needs no fill at all:
            the static column is a normal sibling in the document, not an
            overlay, so it simply shows the same shared card background as
            everything else. Scrolled-away day content can't bleed into it
            either, since it's structurally outside the scrolling element's
            box, not just visually covered by it — the "invisible wall" is
            just the edge of the scroll container itself.

            Row heights are kept in sync across the two independent columns
            with an explicit h-14 (header) / h-12 (goal rows) on both
            sides, since nothing here shares a single grid to
            auto-equalize them anymore.
          */}
          <div className="flex w-[140px] shrink-0 flex-col border-r border-border/60">
            <div className="flex h-14 items-end pb-3 pl-4 text-left text-sm font-medium text-muted-foreground">
              Ziel
            </div>
            {data.goals.map((goal) => (
              <div
                key={goal.id}
                className="flex h-12 items-center gap-2 border-t border-border/60 pl-4 text-sm font-medium"
              >
                {goal.icon && <span className="text-base leading-none">{goal.icon}</span>}
                <span className="truncate">{goal.title}</span>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[504px] grid-cols-[repeat(7,72px)]">
              {data.days.map((day, i) => (
                <div
                  key={day}
                  ref={day === today ? todayColRef : undefined}
                  className={`flex h-14 flex-col justify-end px-2 pb-3 text-center text-xs font-normal ${i === data.days.length - 1 ? "pr-4" : ""} ${
                    day === today ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div>{WEEKDAY_FORMAT.format(new Date(day + "T00:00:00Z"))}</div>
                  <div className="font-mono">{DAY_FORMAT.format(new Date(day + "T00:00:00Z"))}</div>
                </div>
              ))}

              {data.goals.map((goal) => (
                <Fragment key={goal.id}>
                  {data.days.map((day, i) => (
                    <div
                      key={day}
                      className={`flex h-12 items-center justify-center border-t border-border/60 ${i === data.days.length - 1 ? "pr-4" : ""}`}
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

  if (entry?.skipped) {
    return (
      <Popover>
        <PopoverTrigger
          className={`mx-auto flex size-10 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground outline-none ${ringClass}`}
          aria-label={entry.skipReason ? `Übersprungen: ${entry.skipReason}` : "Übersprungen"}
        >
          <Check className="size-4" />
        </PopoverTrigger>
        {entry.skipReason && (
          <PopoverContent>
            <p className="text-xs text-muted-foreground">{entry.skipReason}</p>
          </PopoverContent>
        )}
      </Popover>
    );
  }

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

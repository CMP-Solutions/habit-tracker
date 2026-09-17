const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * A single item shown in a day cell — either a real event occurrence or an
 * open ToDo's due date, unified for rendering. `kind` drives the visual
 * distinction (chip color) and, at the call site, which edit route to link
 * to; it carries no other behavior here.
 */
export interface CalendarEntry {
  id: string;
  kind: "event" | "todo";
  title: string;
  date: string;
  time: string | null;
}

export function CalendarGrid({
  days,
  entriesByDate,
  currentMonth,
  todayStr,
  selectedDate,
  onSelectDate,
  maxVisible,
}: {
  days: Date[];
  entriesByDate: Map<string, CalendarEntry[]>;
  /** When set, days outside this UTC month index (0-11) are dimmed. Omit for a week view where every day is "in view". */
  currentMonth?: number;
  todayStr: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  maxVisible: number;
}) {
  return (
    <div className="space-y-1 rounded-xl border bg-card p-3 backdrop-blur-xl sm:p-4">
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = day.toISOString().slice(0, 10);
          const dayEntries = entriesByDate.get(dateStr) ?? [];
          const isOutsideMonth = currentMonth !== undefined && day.getUTCMonth() !== currentMonth;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const visible = dayEntries.slice(0, maxVisible);
          const overflowCount = dayEntries.length - visible.length;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectDate(dateStr)}
              className={`min-h-20 rounded-lg border p-1.5 text-left transition-colors ${
                isSelected ? "border-primary bg-primary/10" : "bg-muted hover:bg-muted/70"
              } ${isOutsideMonth ? "opacity-40" : ""}`}
            >
              <span className={`text-xs ${isToday ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                {day.getUTCDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {visible.map((entry) => (
                  <p
                    key={`${entry.kind}-${entry.id}-${entry.date}`}
                    className={`truncate rounded px-1 py-0.5 text-[11px] ${
                      entry.kind === "todo" ? "bg-primary/15 text-primary" : "bg-card"
                    }`}
                  >
                    {entry.title}
                  </p>
                ))}
                {overflowCount > 0 && <p className="text-[11px] text-muted-foreground">+{overflowCount} weitere</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import type { EventOccurrence } from "@/lib/domain/eventOccurrences";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function CalendarGrid({
  days,
  occurrencesByDate,
  currentMonth,
  todayStr,
  selectedDate,
  onSelectDate,
  maxVisible,
}: {
  days: Date[];
  occurrencesByDate: Map<string, EventOccurrence[]>;
  /** When set, days outside this UTC month index (0-11) are dimmed. Omit for a week view where every day is "in view". */
  currentMonth?: number;
  todayStr: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  maxVisible: number;
}) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = day.toISOString().slice(0, 10);
          const dayOccurrences = occurrencesByDate.get(dateStr) ?? [];
          const isOutsideMonth = currentMonth !== undefined && day.getUTCMonth() !== currentMonth;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const visible = dayOccurrences.slice(0, maxVisible);
          const overflowCount = dayOccurrences.length - visible.length;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectDate(dateStr)}
              className={`min-h-20 rounded-lg border p-1.5 text-left transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              } ${isOutsideMonth ? "opacity-40" : ""}`}
            >
              <span className={`text-xs ${isToday ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                {day.getUTCDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {visible.map((occ) => (
                  <p key={`${occ.eventId}-${occ.date}`} className="truncate rounded bg-muted px-1 py-0.5 text-[11px]">
                    {occ.title}
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

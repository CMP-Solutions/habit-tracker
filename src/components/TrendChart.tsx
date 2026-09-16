"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DayResult {
  date: string;
  success: boolean;
  skipped?: boolean;
}

interface DayPercent {
  date: string;
  percent: number;
}

function rollingSuccessRate(results: DayResult[], windowSize = 7) {
  return results.map((_, i) => {
    const window = results.slice(Math.max(0, i - windowSize + 1), i + 1);
    // A paused day is neither a success nor a failure — left out of the
    // window's denominator entirely, so it doesn't drag the rate down.
    const activeWindow = window.filter((r) => !r.skipped);
    const rate = activeWindow.length > 0 ? activeWindow.filter((r) => r.success).length / activeWindow.length : 0;
    return { date: results[i].date, rate: Math.round(rate * 100) };
  });
}

interface TrendChartProps {
  // Single-goal view (e.g. goal detail): a smoothed 7-day rolling rate reads
  // better for one habit's day-to-day noise.
  results?: DayResult[];
  // Aggregate view (e.g. Auswertung): the day's actual completion rate,
  // against however many goals existed that day — no smoothing, so "5/5 on
  // Monday" and "6/6 on Thursday" both read as 100%, not diluted together.
  dailyPercents?: DayPercent[];
}

export function TrendChart({ results, dailyPercents }: TrendChartProps) {
  const data = dailyPercents
    ? dailyPercents.map((d) => ({ date: d.date, rate: Math.round(d.percent) }))
    : rollingSuccessRate(results ?? []);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis
          dataKey="date"
          stroke="var(--color-muted-foreground)"
          tickFormatter={(value: string) => {
            const [, month, day] = value.split("-");
            return `${day}.${month}.`;
          }}
          tick={{ fill: "var(--color-muted-foreground)", fontFamily: "var(--font-code)", fontSize: 11 }}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          domain={[0, 100]}
          unit="%"
          width={40}
          stroke="var(--color-muted-foreground)"
          tick={{ fill: "var(--color-muted-foreground)" }}
        />
        <Tooltip
          formatter={(value) => [`${value}%`, dailyPercents ? "Ziele erreicht" : "Erfolgsquote (7 Tage)"]}
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-popover-foreground)",
          }}
        />
        <Line type="monotone" dataKey="rate" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

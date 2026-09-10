"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DayResult {
  date: string;
  success: boolean;
}

function rollingSuccessRate(results: DayResult[], windowSize = 7) {
  return results.map((_, i) => {
    const window = results.slice(Math.max(0, i - windowSize + 1), i + 1);
    const rate = window.filter((r) => r.success).length / window.length;
    return { date: results[i].date, rate: Math.round(rate * 100) };
  });
}

export function TrendChart({ results }: { results: DayResult[] }) {
  const data = rollingSuccessRate(results);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="date" tick={false} />
        <YAxis domain={[0, 100]} unit="%" width={40} />
        <Tooltip formatter={(value) => [`${value}%`, "Erfolgsquote (7 Tage)"]} />
        <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

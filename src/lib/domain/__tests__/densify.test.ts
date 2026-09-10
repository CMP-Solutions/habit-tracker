import { describe, it, expect } from "vitest";
import { densifyDailyResults } from "../densify";
import { calculateCurrentStreak, calculateLongestStreak } from "../streak";

const utc = (date: string) => new Date(date + "T00:00:00Z");

describe("densifyDailyResults", () => {
  it("returns one element per calendar day, inclusive of both bounds", () => {
    const results = densifyDailyResults([], utc("2026-09-01"), utc("2026-09-03"));
    expect(results).toEqual([
      { date: "2026-09-01", success: false },
      { date: "2026-09-02", success: false },
      { date: "2026-09-03", success: false },
    ]);
  });

  it("fills days without an entry as failures", () => {
    const results = densifyDailyResults(
      [
        { date: utc("2026-09-01"), success: true },
        { date: utc("2026-09-04"), success: true },
      ],
      utc("2026-09-01"),
      utc("2026-09-04")
    );
    expect(results.map((r) => r.success)).toEqual([true, false, false, true]);
  });

  it("keeps a single day range to one element", () => {
    const results = densifyDailyResults(
      [{ date: utc("2026-09-10"), success: true }],
      utc("2026-09-10"),
      utc("2026-09-10")
    );
    expect(results).toEqual([{ date: "2026-09-10", success: true }]);
  });

  it("ignores entries outside the requested range", () => {
    const results = densifyDailyResults(
      [
        { date: utc("2026-08-01"), success: true },
        { date: utc("2026-09-02"), success: true },
      ],
      utc("2026-09-01"),
      utc("2026-09-02")
    );
    expect(results).toEqual([
      { date: "2026-09-01", success: false },
      { date: "2026-09-02", success: true },
    ]);
  });

  it("returns an empty array when `to` precedes `from`", () => {
    expect(densifyDailyResults([], utc("2026-09-05"), utc("2026-09-01"))).toEqual([]);
  });

  it("truncates time-of-day on the bounds", () => {
    const results = densifyDailyResults([], new Date("2026-09-01T17:45:00Z"), new Date("2026-09-02T03:00:00Z"));
    expect(results.map((r) => r.date)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("makes a calendar gap break the streak", () => {
    const sparse = [
      { date: utc("2026-09-01"), success: true },
      { date: utc("2026-09-10"), success: true },
    ];

    // Without densification the streak functions would see [true, true].
    const dense = densifyDailyResults(sparse, utc("2026-09-01"), utc("2026-09-10"));
    expect(dense).toHaveLength(10);
    expect(calculateCurrentStreak(dense)).toBe(1);
    expect(calculateLongestStreak(dense)).toBe(1);
  });

  it("crosses a month boundary correctly", () => {
    const results = densifyDailyResults([], utc("2026-09-29"), utc("2026-10-02"));
    expect(results.map((r) => r.date)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });
});

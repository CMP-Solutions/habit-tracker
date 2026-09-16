import { describe, it, expect } from "vitest";
import {
  calculateCurrentStreak,
  calculateLongestStreak,
  calculateTotalSuccessCount,
} from "../streak";

const day = (date: string, success: boolean) => ({ date, success });
const skippedDay = (date: string) => ({ date, success: false, skipped: true });

describe("calculateCurrentStreak", () => {
  it("returns 0 for empty results", () => {
    expect(calculateCurrentStreak([])).toBe(0);
  });

  it("returns 0 when the most recent day failed", () => {
    const results = [day("2026-09-08", true), day("2026-09-09", false)];
    expect(calculateCurrentStreak(results)).toBe(0);
  });

  it("counts consecutive successes ending at the last entry", () => {
    const results = [
      day("2026-09-06", false),
      day("2026-09-07", true),
      day("2026-09-08", true),
      day("2026-09-09", true),
    ];
    expect(calculateCurrentStreak(results)).toBe(3);
  });

  it("counts all entries when every one succeeded", () => {
    const results = [day("2026-09-08", true), day("2026-09-09", true)];
    expect(calculateCurrentStreak(results)).toBe(2);
  });
});

describe("calculateCurrentStreak with skipped days", () => {
  it("does not break the streak on a skipped day", () => {
    const results = [
      day("2026-09-07", true),
      skippedDay("2026-09-08"),
      day("2026-09-09", true),
    ];
    expect(calculateCurrentStreak(results)).toBe(2);
  });

  it("does not extend the streak count for the skipped day itself", () => {
    const results = [day("2026-09-08", true), skippedDay("2026-09-09")];
    // Only 2026-09-08 counts; the skip is transparent, not an extra +1.
    expect(calculateCurrentStreak(results)).toBe(1);
  });

  it("still breaks on a real failure even after a skip", () => {
    const results = [
      day("2026-09-07", true),
      skippedDay("2026-09-08"),
      day("2026-09-09", false),
    ];
    expect(calculateCurrentStreak(results)).toBe(0);
  });
});

describe("calculateLongestStreak", () => {
  it("returns 0 for empty results", () => {
    expect(calculateLongestStreak([])).toBe(0);
  });

  it("finds the longest run even if it isn't the most recent one", () => {
    const results = [
      day("2026-09-01", true),
      day("2026-09-02", true),
      day("2026-09-03", true),
      day("2026-09-04", false),
      day("2026-09-05", true),
    ];
    expect(calculateLongestStreak(results)).toBe(3);
  });
});

describe("calculateLongestStreak with skipped days", () => {
  it("bridges a skipped day without resetting the run", () => {
    const results = [
      day("2026-09-01", true),
      day("2026-09-02", true),
      skippedDay("2026-09-03"),
      day("2026-09-04", true),
      day("2026-09-05", false),
    ];
    expect(calculateLongestStreak(results)).toBe(3);
  });
});

describe("calculateTotalSuccessCount", () => {
  it("counts all successful entries regardless of order or gaps", () => {
    const results = [
      day("2026-09-01", true),
      day("2026-09-02", false),
      day("2026-09-03", true),
    ];
    expect(calculateTotalSuccessCount(results)).toBe(2);
  });
});

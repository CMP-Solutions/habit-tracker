import { describe, it, expect } from "vitest";
import {
  calculateCurrentStreak,
  calculateLongestStreak,
  calculateTotalSuccessCount,
} from "../streak";

const day = (date: string, success: boolean) => ({ date, success });

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

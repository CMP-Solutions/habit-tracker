import { describe, it, expect } from "vitest";
import { determineNewMilestones, determineUpcomingProgress } from "../milestones";

const day = (date: string, success: boolean) => ({ date, success });

describe("determineNewMilestones", () => {
  it("returns empty when no threshold is reached", () => {
    const results = [day("2026-09-01", true), day("2026-09-02", true)];
    expect(determineNewMilestones(results, [])).toEqual([]);
  });

  it("awards a 7-day streak milestone once reached", () => {
    const results = Array.from({ length: 7 }, (_, i) =>
      day(`2026-09-0${i + 1}`, true)
    );
    expect(determineNewMilestones(results, [])).toEqual([
      { type: "streak", threshold: 7 },
    ]);
  });

  it("does not re-award a milestone already present", () => {
    const results = Array.from({ length: 7 }, (_, i) =>
      day(`2026-09-0${i + 1}`, true)
    );
    expect(
      determineNewMilestones(results, [{ type: "streak", threshold: 7 }])
    ).toEqual([]);
  });

  it("awards a total-count milestone independently of streak milestones", () => {
    // 100 successes, but with a gap breaking the current streak
    const results = [
      ...Array.from({ length: 99 }, (_, i) => day(`d${i}`, true)),
      day("d99", false),
      day("d100", true),
    ];
    const awards = determineNewMilestones(results, []);
    expect(awards).toContainEqual({ type: "total_count", threshold: 100 });
  });
});

describe("determineUpcomingProgress", () => {
  it("reports progress toward the first unearned threshold of each type", () => {
    expect(determineUpcomingProgress(3, 12, [])).toEqual([
      { type: "streak", threshold: 7, current: 3 },
      { type: "total_count", threshold: 100, current: 12 },
    ]);
  });

  it("skips to the next threshold once the first is already awarded", () => {
    const progress = determineUpcomingProgress(10, 0, [{ type: "streak", threshold: 7 }]);
    expect(progress).toContainEqual({ type: "streak", threshold: 30, current: 10 });
  });

  it("caps current at the threshold so progress never exceeds 100%", () => {
    const progress = determineUpcomingProgress(50, 0, []);
    expect(progress).toContainEqual({ type: "streak", threshold: 7, current: 7 });
  });

  it("omits a type once every threshold has been awarded", () => {
    const progress = determineUpcomingProgress(5, 150, [{ type: "total_count", threshold: 100 }]);
    expect(progress.some((p) => p.type === "total_count")).toBe(false);
  });
});

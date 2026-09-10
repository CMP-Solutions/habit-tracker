import { describe, it, expect } from "vitest";
import { determineNewMilestones } from "../milestones";

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

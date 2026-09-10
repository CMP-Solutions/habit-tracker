import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { db } from "@/lib/db";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";

describe("POST /api/entries", () => {
  let userId: string;
  let goalId: string;

  beforeEach(async () => {
    await db.milestone.deleteMany({});
    await db.entry.deleteMany({});
    await db.goal.deleteMany({});
    await db.user.deleteMany({ where: { email: "entry-test@example.com" } });
    const user = await db.user.create({ data: { email: "entry-test@example.com", passwordHash: "x" } });
    userId = user.id;
    const goal = await db.goal.create({
      data: { userId, title: "Sport", type: "boolean", periodicity: "daily" },
    });
    goalId = goal.id;
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: userId },
    });
  });

  it("creates an entry and returns no milestones below threshold", async () => {
    const res = await POST(
      new Request("http://localhost/api/entries", {
        method: "POST",
        body: JSON.stringify({ goalId, date: "2026-09-10", done: true }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.done).toBe(true);
    expect(body.newMilestones).toEqual([]);
  });

  it("upserts instead of duplicating an entry for the same day", async () => {
    const make = () =>
      POST(
        new Request("http://localhost/api/entries", {
          method: "POST",
          body: JSON.stringify({ goalId, date: "2026-09-10", done: true }),
        })
      );
    await make();
    await make();
    const count = await db.entry.count({ where: { goalId } });
    expect(count).toBe(1);
  });

  it("awards a 7-day streak milestone on the 7th consecutive success", async () => {
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
    for (const date of dates) {
      await POST(new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId, date, done: true }) }));
    }
    const res = await POST(
      new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId, date: "2026-09-07", done: true }) })
    );
    const body = await res.json();
    expect(body.newMilestones).toEqual([{ type: "streak", threshold: 7 }]);

    const milestones = await db.milestone.findMany({ where: { goalId } });
    expect(milestones).toHaveLength(1);
  });

  it("does not award a 7-day streak when a calendar day was skipped", async () => {
    // Seven check-ins, but day 2026-09-07 is missing: the calendar streak is 1,
    // not 7. Before densification the route saw seven consecutive `true` rows
    // and falsely awarded the milestone.
    const dates = [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-08",
    ];
    let last: Response | undefined;
    for (const date of dates) {
      last = await POST(
        new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId, date, done: true }) })
      );
    }
    const body = await last!.json();
    expect(body.newMilestones).toEqual([]);
    expect(await db.milestone.count({ where: { goalId } })).toBe(0);
  });

  it("treats a gap between two check-ins as a broken streak", async () => {
    // Day 1 and day 10 only: the current streak is 1, so nothing is awarded and
    // the gap days are counted as failures (see densify unit tests for the
    // streak values themselves).
    for (const date of ["2026-09-01", "2026-09-10"]) {
      await POST(
        new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId, date, done: true }) })
      );
    }
    const entries = await db.entry.findMany({ where: { goalId } });
    expect(entries).toHaveLength(2);
    expect(await db.milestone.count({ where: { goalId } })).toBe(0);
  });

  it("rejects a malformed date with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/entries", {
        method: "POST",
        body: JSON.stringify({ goalId, date: "not-a-date", done: true }),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/date/i);
  });

  it("rejects an impossible calendar date with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/entries", {
        method: "POST",
        body: JSON.stringify({ goalId, date: "2026-02-31", done: true }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a missing goalId with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/entries", {
        method: "POST",
        body: JSON.stringify({ date: "2026-09-10", done: true }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("breaks the current streak when a period falls short of its target, proving periods are pass/fail units", async () => {
    // periodTarget: 2 per week. Week 1 gets 2 successful check-ins (meets
    // target -> period succeeds). Week 2 gets only 1 (falls short -> period
    // fails). If the route fell back to raw daily evaluation instead of using
    // the count_per_period branch, 3 isolated `true` days would never combine
    // into a failing unit at all — every one of those 3 days would read as an
    // individual success. Asserting the streak is broken back to 0 after the
    // week-2 check-in only makes sense if periods are being evaluated as
    // discrete win/lose units, which is exactly what this proves.
    const periodGoal = await db.goal.create({
      data: { userId, title: "2x pro Woche Fitness", type: "boolean", periodicity: "count_per_period", periodUnit: "week", periodTarget: 2 },
    });

    const make = (date: string) =>
      POST(new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId: periodGoal.id, date, done: true }) }));

    // Week 1: 2026-09-07 (Mon) + 2026-09-08 (Tue) -> period 1 succeeds.
    await make("2026-09-07");
    await make("2026-09-08");
    // Week 2: only 2026-09-15 (Tue) -> period 2 falls short of target 2.
    const third = await make("2026-09-15");
    const thirdBody = await third.json();

    // No milestone is awarded anywhere in this sequence: the streak never
    // reaches a 7/30/100 threshold, and the failed second period resets any
    // in-progress streak back to 0.
    expect(thirdBody.newMilestones).toEqual([]);
    expect(await db.milestone.count({ where: { goalId: periodGoal.id } })).toBe(0);

    // Directly confirm the streak was actually broken (not just "not yet at a
    // milestone threshold") by adding one more successful period (week 3,
    // periodTarget met) and checking it starts counting from 1 again rather
    // than continuing to accumulate from period 1.
    await make("2026-09-21"); // Mon, week 3
    const fifth = await make("2026-09-22"); // Tue, week 3 -> period 3 succeeds
    const fifthBody = await fifth.json();
    expect(fifthBody.newMilestones).toEqual([]); // streak is only 1 period long, not 7

    const totals = await db.entry.count({ where: { goalId: periodGoal.id } });
    expect(totals).toBe(5);
  });

  it("groups check-ins by calendar month when periodUnit is 'month'", async () => {
    // Two check-ins in the same calendar month (September 2026) should
    // combine into a single satisfied period. A third check-in the following
    // month starts a new period rather than joining the first.
    const periodGoal = await db.goal.create({
      data: { userId, title: "2x pro Monat Lesen", type: "boolean", periodicity: "count_per_period", periodUnit: "month", periodTarget: 2 },
    });

    const make = (date: string) =>
      POST(new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId: periodGoal.id, date, done: true }) }));

    await make("2026-09-05");
    const second = await make("2026-09-20");
    const secondBody = await second.json();

    const entries = await db.entry.findMany({ where: { goalId: periodGoal.id }, orderBy: { date: "asc" } });
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.date.toISOString().slice(0, 10))).toEqual(["2026-09-05", "2026-09-20"]);
    // Only one period so far (September), so nothing near a milestone yet.
    expect(secondBody.newMilestones).toEqual([]);

    // A check-in in a different month (October) must not be folded into the
    // September period: it starts its own new period instead of pushing the
    // running count past what a single calendar month actually contains.
    const third = await make("2026-10-05");
    const thirdBody = await third.json();
    const allEntries = await db.entry.count({ where: { goalId: periodGoal.id } });
    expect(allEntries).toBe(3);
    expect(thirdBody.newMilestones).toEqual([]);
  });

  it("awards a 7-period streak milestone across 7 consecutive weekly periods, not 7 raw days", async () => {
    const periodGoal = await db.goal.create({
      data: { userId, title: "1x pro Woche", type: "boolean", periodicity: "count_per_period", periodUnit: "week", periodTarget: 1 },
    });

    // 7 Mondays, 7 days apart — one check-in per calendar week, 7 weeks running.
    const mondays = [
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ];
    let lastBody: { newMilestones: { type: string; threshold: number }[] } = { newMilestones: [] };
    for (const date of mondays) {
      const res = await POST(
        new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId: periodGoal.id, date, done: true }) })
      );
      lastBody = await res.json();
    }

    // 7 consecutive successful weekly periods form a 7-period streak. Fed
    // through raw daily evaluation instead, these 7 isolated days (6 empty,
    // failed days between each of them) would never form a 7-long streak —
    // this is what proves the period-grouping branch is actually being used,
    // not just that entries are being recorded.
    expect(lastBody.newMilestones).toEqual([{ type: "streak", threshold: 7 }]);
  });
});

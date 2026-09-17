import { describe, it, expect } from "vitest";
import { occurrencesInRange } from "../eventOccurrences";
import type { EventRecord } from "@/lib/storage/db";

function makeEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: "e1",
    title: "Termin",
    date: "2026-09-10",
    allDay: true,
    time: null,
    recurrence: "none",
    createdAt: "2026-09-01",
    ...overrides,
  };
}

function range(startStr: string, endStr: string) {
  return {
    rangeStart: new Date(startStr + "T00:00:00Z"),
    rangeEnd: new Date(endStr + "T00:00:00Z"),
  };
}

describe("occurrencesInRange: recurrence 'none'", () => {
  it("includes a one-off event whose date falls within the range", () => {
    const event = makeEvent({ date: "2026-09-15" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result).toEqual([{ eventId: "e1", title: "Termin", date: "2026-09-15", allDay: true, time: null }]);
  });

  it("excludes a one-off event before the range", () => {
    const event = makeEvent({ date: "2026-08-15" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toEqual([]);
  });

  it("excludes a one-off event after the range", () => {
    const event = makeEvent({ date: "2026-10-15" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toEqual([]);
  });

  it("includes an event exactly at rangeStart (inclusive)", () => {
    const event = makeEvent({ date: "2026-09-01" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toHaveLength(1);
  });

  it("excludes an event exactly at rangeEnd (exclusive)", () => {
    const event = makeEvent({ date: "2026-10-01" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toEqual([]);
  });
});

describe("occurrencesInRange: recurrence 'weekly'", () => {
  it("generates one occurrence per matching weekday across a range", () => {
    // 2026-09-01 is a Tuesday.
    const event = makeEvent({ date: "2026-09-01", recurrence: "weekly" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-09-29");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]);
  });

  it("aligns to the correct weekday when the range starts mid-series", () => {
    const event = makeEvent({ date: "2026-09-01", recurrence: "weekly" });
    const { rangeStart, rangeEnd } = range("2026-09-10", "2026-09-24");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2026-09-15", "2026-09-22"]);
  });

  it("produces no occurrences when the series starts after the range", () => {
    const event = makeEvent({ date: "2026-12-01", recurrence: "weekly" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toEqual([]);
  });
});

describe("occurrencesInRange: recurrence 'yearly'", () => {
  it("generates one occurrence per year on the same month/day", () => {
    const event = makeEvent({ date: "2024-03-05", recurrence: "yearly" });
    const { rangeStart, rangeEnd } = range("2026-01-01", "2029-01-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2026-03-05", "2027-03-05", "2028-03-05"]);
  });

  it("falls back Feb 29 to Feb 28 in a non-leap year", () => {
    const event = makeEvent({ date: "2024-02-29", recurrence: "yearly" });
    const { rangeStart, rangeEnd } = range("2025-01-01", "2026-01-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2025-02-28"]);
  });

  it("keeps Feb 29 in a leap year", () => {
    const event = makeEvent({ date: "2024-02-29", recurrence: "yearly" });
    const { rangeStart, rangeEnd } = range("2028-01-01", "2029-01-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2028-02-29"]);
  });
});

describe("occurrencesInRange: multiple events", () => {
  it("combines and sorts occurrences from several events by date", () => {
    const eventA = makeEvent({ id: "a", title: "A", date: "2026-09-20" });
    const eventB = makeEvent({ id: "b", title: "B", date: "2026-09-10" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    const result = occurrencesInRange([eventA, eventB], rangeStart, rangeEnd);
    expect(result.map((o) => o.eventId)).toEqual(["b", "a"]);
  });

  it("carries allDay and time through to the occurrence", () => {
    const event = makeEvent({ date: "2026-09-10", allDay: false, time: "14:30" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result[0]).toMatchObject({ allDay: false, time: "14:30" });
  });
});

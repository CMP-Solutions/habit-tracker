import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createEvent, getEvent, updateEvent, deleteEvent, listEvents, getOccurrencesForRange } from "../events";

describe("events storage: CRUD", () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it("creates an all-day event with defaults", async () => {
    const event = await createEvent({ title: "Geburtstag Mama", date: "2026-10-05", allDay: true, recurrence: "none" });
    expect(event.title).toBe("Geburtstag Mama");
    expect(event.date).toBe("2026-10-05");
    expect(event.allDay).toBe(true);
    expect(event.time).toBeNull();
    expect(event.recurrence).toBe("none");
    expect(event.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("creates a timed event", async () => {
    const event = await createEvent({
      title: "Zahnarzt",
      date: "2026-10-05",
      allDay: false,
      time: "09:30",
      recurrence: "none",
    });
    expect(event.allDay).toBe(false);
    expect(event.time).toBe("09:30");
  });

  it("forces time to null when allDay is true even if time is passed", async () => {
    const event = await createEvent({ title: "Feiertag", date: "2026-10-03", allDay: true, time: "09:00", recurrence: "none" });
    expect(event.time).toBeNull();
  });

  it("rejects an empty title", async () => {
    await expect(createEvent({ title: "", date: "2026-10-05", allDay: true, recurrence: "none" })).rejects.toThrow();
    await expect(createEvent({ title: "   ", date: "2026-10-05", allDay: true, recurrence: "none" })).rejects.toThrow();
  });

  it("trims the title", async () => {
    const event = await createEvent({ title: "  Umzug  ", date: "2026-10-05", allDay: true, recurrence: "none" });
    expect(event.title).toBe("Umzug");
  });

  it("gets an event by id", async () => {
    const created = await createEvent({ title: "Konzert", date: "2026-10-05", allDay: true, recurrence: "none" });
    const fetched = await getEvent(created.id);
    expect(fetched).toEqual(created);
  });

  it("throws when getting a nonexistent event", async () => {
    await expect(getEvent("does-not-exist")).rejects.toThrow("Not found");
  });

  it("updates an event's fields", async () => {
    const created = await createEvent({ title: "Konzert", date: "2026-10-05", allDay: true, recurrence: "none" });
    const updated = await updateEvent(created.id, { title: "Konzert (verschoben)", date: "2026-10-06" });
    expect(updated.title).toBe("Konzert (verschoben)");
    expect(updated.date).toBe("2026-10-06");
  });

  it("clears time when updating allDay to true", async () => {
    const created = await createEvent({ title: "Meeting", date: "2026-10-05", allDay: false, time: "14:00", recurrence: "none" });
    const updated = await updateEvent(created.id, { allDay: true });
    expect(updated.allDay).toBe(true);
    expect(updated.time).toBeNull();
  });

  it("rejects updating to an empty title", async () => {
    const created = await createEvent({ title: "Konzert", date: "2026-10-05", allDay: true, recurrence: "none" });
    await expect(updateEvent(created.id, { title: "   " })).rejects.toThrow();
  });

  it("throws when updating a nonexistent event", async () => {
    await expect(updateEvent("does-not-exist", { title: "x" })).rejects.toThrow("Not found");
  });

  it("deletes an event", async () => {
    const created = await createEvent({ title: "Konzert", date: "2026-10-05", allDay: true, recurrence: "none" });
    await deleteEvent(created.id);
    await expect(getEvent(created.id)).rejects.toThrow("Not found");
  });

  it("does not throw deleting a nonexistent event", async () => {
    await expect(deleteEvent("does-not-exist")).resolves.toBeUndefined();
  });

  it("lists all events", async () => {
    await createEvent({ title: "A", date: "2026-10-05", allDay: true, recurrence: "none" });
    await createEvent({ title: "B", date: "2026-10-06", allDay: true, recurrence: "none" });
    const all = await listEvents();
    expect(all).toHaveLength(2);
  });
});

describe("getOccurrencesForRange", () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it("returns occurrences for a one-off event within range", async () => {
    await createEvent({ title: "Geburtstag", date: "2026-10-05", allDay: true, recurrence: "none" });
    const result = await getOccurrencesForRange(new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(result.map((o) => o.title)).toEqual(["Geburtstag"]);
  });

  it("expands a weekly event into multiple occurrences", async () => {
    await createEvent({ title: "Sport", date: "2026-10-05", allDay: true, recurrence: "weekly" });
    const result = await getOccurrencesForRange(new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(result.length).toBeGreaterThan(1);
  });

  it("returns nothing for a range with no matching events", async () => {
    await createEvent({ title: "Geburtstag", date: "2026-10-05", allDay: true, recurrence: "none" });
    const result = await getOccurrencesForRange(new Date("2027-01-01T00:00:00Z"), new Date("2027-02-01T00:00:00Z"));
    expect(result).toEqual([]);
  });
});

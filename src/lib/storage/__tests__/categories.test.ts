import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createCategory, listCategories } from "../categories";

describe("categories storage", () => {
  beforeEach(async () => {
    await db.categories.clear();
  });

  it("creates a category and lists it", async () => {
    const created = await createCategory({ name: "Gesundheit", color: "#22c55e", icon: "heart" });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Gesundheit");

    const all = await listCategories();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(created);
  });

  it("lists categories sorted by name", async () => {
    await createCategory({ name: "Sport", color: "#000", icon: "a" });
    await createCategory({ name: "Ernährung", color: "#111", icon: "b" });

    const all = await listCategories();
    expect(all.map((c) => c.name)).toEqual(["Ernährung", "Sport"]);
  });

  it("rejects a category missing required fields", async () => {
    await expect(createCategory({ name: "", color: "#000", icon: "a" })).rejects.toThrow(
      "name, color and icon are required."
    );
  });
});

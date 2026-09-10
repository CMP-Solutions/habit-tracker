import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "./route";
import { db } from "@/lib/db";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";

const mockSession = (userId: string) =>
  (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
    user: { id: userId },
  });

describe("/api/categories", () => {
  let userId: string;

  beforeEach(async () => {
    await db.category.deleteMany({});
    await db.user.deleteMany({ where: { email: "cat-test@example.com" } });
    const user = await db.user.create({
      data: { email: "cat-test@example.com", passwordHash: "x" },
    });
    userId = user.id;
    mockSession(userId);
  });

  it("creates and lists a category scoped to the user", async () => {
    const createRes = await POST(
      new Request("http://localhost/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: "Gesundheit", color: "#22c55e", icon: "heart" }),
      })
    );
    expect(createRes.status).toBe(201);

    const listRes = await GET();
    const categories = await listRes.json();
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe("Gesundheit");
  });

  it("rejects unauthenticated requests with 401", async () => {
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

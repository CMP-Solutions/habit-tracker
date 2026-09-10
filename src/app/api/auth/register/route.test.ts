import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { db } from "@/lib/db";

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await db.user.deleteMany({ where: { email: "newuser@example.com" } });
  });

  it("creates a user with a hashed password", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "newuser@example.com", password: "secret123", name: "New User" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const user = await db.user.findUnique({ where: { email: "newuser@example.com" } });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe("secret123");
  });

  it("rejects a duplicate email with 409", async () => {
    const body = JSON.stringify({ email: "newuser@example.com", password: "secret123" });
    await POST(new Request("http://localhost/api/auth/register", { method: "POST", body }));
    const res = await POST(new Request("http://localhost/api/auth/register", { method: "POST", body }));
    expect(res.status).toBe(409);
  });
});

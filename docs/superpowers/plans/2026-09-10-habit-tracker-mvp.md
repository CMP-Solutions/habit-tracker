# Habit & Goal Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of a habit/goal tracker web app: users create daily
or weekly goals (boolean or quantitative), check them off, and see their
progress via a heatmap, a trend chart, and automatically-awarded streak
milestones.

**Architecture:** Single Next.js (App Router, TypeScript) project with
API routes as the backend, Prisma + PostgreSQL for persistence, NextAuth
credentials-based auth, Tailwind CSS + shadcn/ui for styling. Core
domain logic (streaks, weekly-goal evaluation, milestone assignment) is
written as pure, independently unit-tested functions, called from API
routes.

**Tech Stack:** Next.js 14+ (App Router), TypeScript, Prisma, PostgreSQL,
NextAuth.js, Tailwind CSS, shadcn/ui, Recharts, Vitest (unit tests).

**Spec:** `docs/superpowers/specs/2026-09-10-habit-tracker-design.md`

## Global Constraints

- Data model exactly as specified in the spec §3: `User`, `Category`,
  `Goal`, `Entry`, `Milestone` — field names and types below match the
  spec verbatim.
- Auth: email + password only (NextAuth Credentials provider), no OAuth
  providers (spec §8, out of scope).
- Goal type is either `"boolean"` or `"quantitative"`; periodicity is
  either `"daily"` or `"weekly"`.
- Entry uniqueness: one `Entry` per `(goalId, date)` — enforced at the DB
  level and via upsert in the API.
- Milestones are automatic only (streak-based), never user-defined (spec
  §8).
- No E2E test framework in this phase (spec §7) — only unit tests for
  domain logic and integration tests for API routes.
- Dates are stored and compared as calendar days (no time component) in
  the browser's local timezone (spec §6).

---

## File Structure

```
habit-tracker/
  prisma/
    schema.prisma
  src/
    app/
      layout.tsx
      page.tsx                       # Dashboard
      login/page.tsx
      register/page.tsx
      goals/new/page.tsx
      goals/[id]/page.tsx            # Goal detail
      stats/page.tsx
      milestones/page.tsx
      settings/page.tsx
      api/
        auth/[...nextauth]/route.ts
        auth/register/route.ts
        categories/route.ts
        goals/route.ts
        goals/[id]/route.ts
        entries/route.ts
    lib/
      db.ts                          # Prisma client singleton
      auth.ts                        # NextAuth config
      domain/
        streak.ts
        weeklyGoal.ts
        milestones.ts
        __tests__/
          streak.test.ts
          weeklyGoal.test.ts
          milestones.test.ts
    components/
      GoalCard.tsx
      Heatmap.tsx
      TrendChart.tsx
      CategoryBadge.tsx
      GoalForm.tsx
```

Each domain file in `src/lib/domain/` has one responsibility (streak
math, weekly-goal math, milestone math) and no dependency on Prisma or
Next.js — they take plain data in and return plain data out, which is
what makes them cheap to unit test and safe to reuse from any API route.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`,
  `postcss.config.js`, `next.config.js`, `.eslintrc.json`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx` (placeholder)

**Interfaces:**
- Produces: a runnable Next.js dev server at `npm run dev`.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
cd ~/Projects/habit-tracker
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

When prompted about the existing git repo / non-empty directory, accept
using the current directory.

- [ ] **Step 2: Install shadcn/ui and initialize it**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label select badge dialog form checkbox
```

- [ ] **Step 3: Verify the dev server runs**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000`, default Next.js page
loads without errors. Stop the server (Ctrl+C) after confirming.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind and shadcn/ui"
```

---

### Task 2: Prisma schema and database setup

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `.env` (local, gitignored), `.env.example`

**Interfaces:**
- Produces: `prisma` client exported as `db` from `src/lib/db.ts`, and
  generated Prisma types `User`, `Category`, `Goal`, `Entry`, `Milestone`.

- [ ] **Step 1: Install Prisma**

```bash
npm install prisma @prisma/client
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Write the schema**

Replace `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  name         String?
  createdAt    DateTime   @default(now())
  categories   Category[]
  goals        Goal[]
}

model Category {
  id     String  @id @default(cuid())
  userId String
  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  name   String
  color  String
  icon   String
  goals  Goal[]

  @@unique([userId, name])
}

model Goal {
  id              String     @id @default(cuid())
  userId          String
  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId      String?
  category        Category?  @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  title           String
  description     String?
  type            String     // "boolean" | "quantitative"
  unit            String?
  targetValue     Float?
  periodicity     String     // "daily" | "weekly"
  weeklyThreshold Int?
  archived        Boolean    @default(false)
  createdAt       DateTime   @default(now())
  entries         Entry[]
  milestones      Milestone[]
}

model Entry {
  id     String   @id @default(cuid())
  goalId String
  goal   Goal     @relation(fields: [goalId], references: [id], onDelete: Cascade)
  date   DateTime // stored as UTC midnight representing a calendar day
  done   Boolean  @default(false)
  value  Float?

  @@unique([goalId, date])
}

model Milestone {
  id         String   @id @default(cuid())
  goalId     String
  goal       Goal     @relation(fields: [goalId], references: [id], onDelete: Cascade)
  type       String   // "streak" | "total_count"
  threshold  Int
  achievedAt DateTime @default(now())

  @@unique([goalId, type, threshold])
}
```

- [ ] **Step 3: Write the Prisma client singleton**

`src/lib/db.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { db: PrismaClient };

export const db = globalForPrisma.db ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.db = db;
}
```

- [ ] **Step 4: Configure local database connection**

Create `.env.example`:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/habit_tracker"
NEXTAUTH_SECRET="replace-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
```

Copy it to `.env` and fill in real local Postgres credentials (create a
local `habit_tracker` database first, e.g. via `createdb habit_tracker`
if using a local Postgres install, or a Docker container).

- [ ] **Step 5: Run the initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration succeeds, tables created, Prisma Client generated.

- [ ] **Step 6: Commit**

```bash
git add prisma src/lib/db.ts .env.example .gitignore
git commit -m "feat: add Prisma schema and database client"
```

---

### Task 3: Domain logic — streak calculation

**Files:**
- Create: `src/lib/domain/streak.ts`
- Test: `src/lib/domain/__tests__/streak.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  interface DailyResult { date: string; success: boolean } // date = "YYYY-MM-DD"
  function calculateCurrentStreak(results: DailyResult[]): number
  function calculateLongestStreak(results: DailyResult[]): number
  function calculateTotalSuccessCount(results: DailyResult[]): number
  ```
  `results` must be sorted ascending by date and represent *consecutive*
  periods (no gaps in the array itself — a missing day is represented as
  `{ date, success: false }`, not by omitting the entry). This contract
  is used identically by Task 4 (weekly) by passing one `DailyResult` per
  week instead of per day.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing tests**

`src/lib/domain/__tests__/streak.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/domain/__tests__/streak.test.ts`
Expected: FAIL — `../streak` module not found.

- [ ] **Step 4: Implement the domain logic**

`src/lib/domain/streak.ts`:

```typescript
export interface DailyResult {
  date: string;
  success: boolean;
}

export function calculateCurrentStreak(results: DailyResult[]): number {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (!results[i].success) break;
    streak++;
  }
  return streak;
}

export function calculateLongestStreak(results: DailyResult[]): number {
  let longest = 0;
  let current = 0;
  for (const result of results) {
    if (result.success) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function calculateTotalSuccessCount(results: DailyResult[]): number {
  return results.filter((r) => r.success).length;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/domain/__tests__/streak.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/domain/streak.ts src/lib/domain/__tests__/streak.test.ts
git commit -m "feat: add streak calculation domain logic"
```

---

### Task 4: Domain logic — weekly goal evaluation

**Files:**
- Create: `src/lib/domain/weeklyGoal.ts`
- Test: `src/lib/domain/__tests__/weeklyGoal.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  ```typescript
  interface DayEntry { date: string; success: boolean } // "YYYY-MM-DD", Monday-first weeks
  function groupIntoWeeks(entries: DayEntry[]): DayEntry[][]
  function evaluateWeek(week: DayEntry[], threshold: number): boolean
  ```
  `evaluateWeek` returns `true` if the count of `success: true` days in
  the week is `>= threshold`. This is used together with Task 3's
  `calculateCurrentStreak`/`calculateLongestStreak` by mapping each week
  to a `DailyResult` (`{ date: week[0].date, success: evaluateWeek(week, threshold) }`).

- [ ] **Step 1: Write the failing tests**

`src/lib/domain/__tests__/weeklyGoal.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { groupIntoWeeks, evaluateWeek } from "../weeklyGoal";

const day = (date: string, success: boolean) => ({ date, success });

describe("groupIntoWeeks", () => {
  it("groups consecutive days into Monday-first weeks", () => {
    // 2026-09-07 is a Monday
    const entries = [
      day("2026-09-07", true),
      day("2026-09-08", true),
      day("2026-09-13", true), // Sunday, same week
      day("2026-09-14", false), // next Monday, new week
    ];
    const weeks = groupIntoWeeks(entries);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveLength(3);
    expect(weeks[1]).toHaveLength(1);
  });

  it("returns an empty array for no entries", () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });
});

describe("evaluateWeek", () => {
  it("succeeds when successful days meet the threshold", () => {
    const week = [
      day("2026-09-07", true),
      day("2026-09-08", true),
      day("2026-09-09", true),
      day("2026-09-10", false),
      day("2026-09-11", true),
      day("2026-09-12", false),
      day("2026-09-13", false),
    ];
    expect(evaluateWeek(week, 4)).toBe(true);
    expect(evaluateWeek(week, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/domain/__tests__/weeklyGoal.test.ts`
Expected: FAIL — `../weeklyGoal` module not found.

- [ ] **Step 3: Implement the domain logic**

`src/lib/domain/weeklyGoal.ts`:

```typescript
export interface DayEntry {
  date: string; // "YYYY-MM-DD"
  success: boolean;
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

export function groupIntoWeeks(entries: DayEntry[]): DayEntry[][] {
  const weeks = new Map<string, DayEntry[]>();
  for (const entry of entries) {
    const key = mondayOf(entry.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(entry);
  }
  return Array.from(weeks.keys())
    .sort()
    .map((key) => weeks.get(key)!);
}

export function evaluateWeek(week: DayEntry[], threshold: number): boolean {
  const successCount = week.filter((d) => d.success).length;
  return successCount >= threshold;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/domain/__tests__/weeklyGoal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/weeklyGoal.ts src/lib/domain/__tests__/weeklyGoal.test.ts
git commit -m "feat: add weekly goal evaluation domain logic"
```

---

### Task 5: Domain logic — milestone assignment

**Files:**
- Create: `src/lib/domain/milestones.ts`
- Test: `src/lib/domain/__tests__/milestones.test.ts`

**Interfaces:**
- Consumes: `calculateCurrentStreak`, `calculateTotalSuccessCount` from
  `src/lib/domain/streak.ts` (Task 3).
- Produces:
  ```typescript
  interface MilestoneAward { type: "streak" | "total_count"; threshold: number }
  const STREAK_THRESHOLDS: number[] = [7, 30, 100];
  const TOTAL_COUNT_THRESHOLDS: number[] = [100];
  function determineNewMilestones(
    results: DailyResult[],
    alreadyAwarded: MilestoneAward[]
  ): MilestoneAward[]
  ```
  `determineNewMilestones` is pure and idempotent: given the same
  `results` and `alreadyAwarded`, it always returns the same (possibly
  empty) list of *newly* earned milestones, i.e. thresholds crossed that
  are not already in `alreadyAwarded`. The caller (Task 9) is
  responsible for persisting the returned awards as `Milestone` rows.

- [ ] **Step 1: Write the failing tests**

`src/lib/domain/__tests__/milestones.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/domain/__tests__/milestones.test.ts`
Expected: FAIL — `../milestones` module not found.

- [ ] **Step 3: Implement the domain logic**

`src/lib/domain/milestones.ts`:

```typescript
import {
  DailyResult,
  calculateCurrentStreak,
  calculateTotalSuccessCount,
} from "./streak";

export interface MilestoneAward {
  type: "streak" | "total_count";
  threshold: number;
}

export const STREAK_THRESHOLDS = [7, 30, 100];
export const TOTAL_COUNT_THRESHOLDS = [100];

function alreadyHas(
  awarded: MilestoneAward[],
  type: MilestoneAward["type"],
  threshold: number
): boolean {
  return awarded.some((a) => a.type === type && a.threshold === threshold);
}

export function determineNewMilestones(
  results: DailyResult[],
  alreadyAwarded: MilestoneAward[]
): MilestoneAward[] {
  const newAwards: MilestoneAward[] = [];

  const currentStreak = calculateCurrentStreak(results);
  for (const threshold of STREAK_THRESHOLDS) {
    if (currentStreak >= threshold && !alreadyHas(alreadyAwarded, "streak", threshold)) {
      newAwards.push({ type: "streak", threshold });
    }
  }

  const totalCount = calculateTotalSuccessCount(results);
  for (const threshold of TOTAL_COUNT_THRESHOLDS) {
    if (totalCount >= threshold && !alreadyHas(alreadyAwarded, "total_count", threshold)) {
      newAwards.push({ type: "total_count", threshold });
    }
  }

  return newAwards;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/domain/__tests__/milestones.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/milestones.ts src/lib/domain/__tests__/milestones.test.ts
git commit -m "feat: add milestone assignment domain logic"
```

---

### Task 6: Authentication — register, login, NextAuth config

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/register/page.tsx`
- Test: `src/app/api/auth/register/route.test.ts`

**Interfaces:**
- Consumes: `db` from `src/lib/db.ts` (Task 2).
- Produces: `authOptions` (NextAuth config) exported from
  `src/lib/auth.ts`, used by every later protected API route via
  `getServerSession(authOptions)`.

- [ ] **Step 1: Install NextAuth and bcrypt**

```bash
npm install next-auth bcryptjs
npm install -D @types/bcryptjs supertest
```

- [ ] **Step 2: Write the failing test for registration**

`src/app/api/auth/register/route.test.ts`:

```typescript
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
```

This test hits a real local test database (same one from Task 2) — no
mocking of Prisma, per the spec's integration-test approach.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/app/api/auth/register/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 4: Implement the register API route**

`src/app/api/auth/register/route.ts`:

```typescript
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { email, password, name } = await req.json();

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Email and a password of at least 8 characters are required." },
      { status: 400 }
    );
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.create({ data: { email, passwordHash, name } });

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/api/auth/register/route.test.ts`
Expected: PASS (2 tests). Requires `DATABASE_URL` in `.env` pointing at
a running Postgres instance (already set up in Task 2).

- [ ] **Step 6: Write the NextAuth config**

`src/lib/auth.ts`:

```typescript
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({ where: { email: credentials.email } });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.id as string;
      return session;
    },
  },
};
```

`src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 7: Build the login and register pages**

`src/app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setError("Ungültige E-Mail oder Passwort.");
      return;
    }
    router.push("/");
  }

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Anmelden</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-Mail</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Passwort</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full">Anmelden</Button>
      </form>
    </div>
  );
}
```

`src/app/register/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Registrierung fehlgeschlagen.");
      return;
    }
    router.push("/login");
  }

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Registrieren</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-Mail</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Passwort (mind. 8 Zeichen)</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full">Konto erstellen</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Manually verify the auth flow**

Run `npm run dev`, go to `/register`, create an account, confirm redirect
to `/login`, log in, confirm no error is shown.

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth src/app/login src/app/register package.json package-lock.json
git commit -m "feat: add credentials-based authentication"
```

---

### Task 7: API routes — Categories CRUD

**Files:**
- Create: `src/app/api/categories/route.ts`
- Test: `src/app/api/categories/route.test.ts`

**Interfaces:**
- Consumes: `db` (Task 2), `authOptions` (Task 6).
- Produces: `GET /api/categories` (list current user's categories),
  `POST /api/categories` (create `{ name, color, icon }`, returns 201
  with the created `Category`).

- [ ] **Step 1: Write the failing tests**

`src/app/api/categories/route.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/categories/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement the route**

`src/app/api/categories/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await db.category.findMany({
    where: { userId: (session.user as { id: string }).id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(categories);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, color, icon } = await req.json();
  if (!name || !color || !icon) {
    return NextResponse.json({ error: "name, color and icon are required." }, { status: 400 });
  }

  const category = await db.category.create({
    data: { userId: (session.user as { id: string }).id, name, color, icon },
  });
  return NextResponse.json(category, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/categories/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/categories
git commit -m "feat: add categories CRUD API"
```

---

### Task 8: API routes — Goals CRUD

**Files:**
- Create: `src/app/api/goals/route.ts`
- Create: `src/app/api/goals/[id]/route.ts`
- Test: `src/app/api/goals/route.test.ts`

**Interfaces:**
- Consumes: `db`, `authOptions`.
- Produces: `GET /api/goals` (list non-archived goals for current user,
  including `category`), `POST /api/goals` (create), `PATCH
  /api/goals/[id]` (update, including `archived`), matching the `Goal`
  fields from the spec (`title`, `description`, `type`, `unit`,
  `targetValue`, `periodicity`, `weeklyThreshold`, `categoryId`).

- [ ] **Step 1: Write the failing test**

`src/app/api/goals/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "./route";
import { db } from "@/lib/db";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";

describe("/api/goals", () => {
  let userId: string;

  beforeEach(async () => {
    await db.goal.deleteMany({});
    await db.user.deleteMany({ where: { email: "goal-test@example.com" } });
    const user = await db.user.create({ data: { email: "goal-test@example.com", passwordHash: "x" } });
    userId = user.id;
    (getServerSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: userId },
    });
  });

  it("creates a daily boolean goal and lists it", async () => {
    const createRes = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Keine Süßigkeiten",
          type: "boolean",
          periodicity: "daily",
        }),
      })
    );
    expect(createRes.status).toBe(201);

    const listRes = await GET();
    const goals = await listRes.json();
    expect(goals).toHaveLength(1);
    expect(goals[0].title).toBe("Keine Süßigkeiten");
  });

  it("creates a weekly quantitative goal with target and threshold", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "3 Liter Wasser",
          type: "quantitative",
          unit: "Liter",
          targetValue: 3,
          periodicity: "weekly",
          weeklyThreshold: 5,
        }),
      })
    );
    const goal = await res.json();
    expect(goal.targetValue).toBe(3);
    expect(goal.weeklyThreshold).toBe(5);
  });

  it("rejects a quantitative goal without targetValue", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({ title: "Bad goal", type: "quantitative", periodicity: "daily" }),
      })
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/goals/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement `src/app/api/goals/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const goals = await db.goal.findMany({
    where: { userId: (session.user as { id: string }).id, archived: false },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(goals);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, type, unit, targetValue, periodicity, weeklyThreshold, categoryId } = body;

  if (!title || !["boolean", "quantitative"].includes(type) || !["daily", "weekly"].includes(periodicity)) {
    return NextResponse.json({ error: "title, valid type and periodicity are required." }, { status: 400 });
  }
  if (type === "quantitative" && (targetValue === undefined || targetValue === null)) {
    return NextResponse.json({ error: "targetValue is required for quantitative goals." }, { status: 400 });
  }
  if (periodicity === "weekly" && (weeklyThreshold === undefined || weeklyThreshold === null)) {
    return NextResponse.json({ error: "weeklyThreshold is required for weekly goals." }, { status: 400 });
  }

  const goal = await db.goal.create({
    data: {
      userId: (session.user as { id: string }).id,
      title,
      description,
      type,
      unit,
      targetValue,
      periodicity,
      weeklyThreshold,
      categoryId,
    },
  });
  return NextResponse.json(goal, { status: 201 });
}
```

- [ ] **Step 4: Implement `src/app/api/goals/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const existing = await db.goal.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const goal = await db.goal.update({ where: { id: params.id }, data: body });
  return NextResponse.json(goal);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const existing = await db.goal.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const entryCount = await db.entry.count({ where: { goalId: params.id } });
  if (entryCount > 0) {
    return NextResponse.json({ error: "Goal has entries; archive it instead of deleting." }, { status: 409 });
  }

  await db.goal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/goals/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/goals
git commit -m "feat: add goals CRUD API"
```

---

### Task 9: API route — Entries (check-in), wired to streak/milestone logic

**Files:**
- Create: `src/app/api/entries/route.ts`
- Test: `src/app/api/entries/route.test.ts`

**Interfaces:**
- Consumes: `db`, `authOptions`, `calculateCurrentStreak` /
  `calculateTotalSuccessCount` (Task 3, via `determineNewMilestones`),
  `determineNewMilestones` (Task 5), `groupIntoWeeks` / `evaluateWeek`
  (Task 4).
- Produces: `POST /api/entries` — upserts an `Entry` for
  `{ goalId, date, done? , value? }`, recomputes streak/milestones for
  that goal, persists any newly-earned `Milestone` rows, and returns
  `{ entry, newMilestones: MilestoneAward[] }`.

- [ ] **Step 1: Write the failing test**

`src/app/api/entries/route.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/entries/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement the route**

`src/app/api/entries/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { DailyResult } from "@/lib/domain/streak";
import { groupIntoWeeks, evaluateWeek } from "@/lib/domain/weeklyGoal";
import { determineNewMilestones, MilestoneAward } from "@/lib/domain/milestones";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { goalId, date, done, value } = await req.json();
  const goal = await db.goal.findUnique({ where: { id: goalId } });
  if (!goal || goal.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dayDate = new Date(date + "T00:00:00Z");
  const entry = await db.entry.upsert({
    where: { goalId_date: { goalId, date: dayDate } },
    update: { done: !!done, value: value ?? null },
    create: { goalId, date: dayDate, done: !!done, value: value ?? null },
  });

  const allEntries = await db.entry.findMany({ where: { goalId }, orderBy: { date: "asc" } });
  const dailyResults: DailyResult[] = allEntries.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
  }));

  let evaluationResults: DailyResult[] = dailyResults;
  if (goal.periodicity === "weekly" && goal.weeklyThreshold != null) {
    const weeks = groupIntoWeeks(dailyResults.map((d) => ({ date: d.date, success: d.success })));
    evaluationResults = weeks.map((week) => ({
      date: week[0].date,
      success: evaluateWeek(week, goal.weeklyThreshold as number),
    }));
  }

  const existingMilestones = await db.milestone.findMany({ where: { goalId } });
  const alreadyAwarded: MilestoneAward[] = existingMilestones.map((m) => ({
    type: m.type as "streak" | "total_count",
    threshold: m.threshold,
  }));

  const newMilestones = determineNewMilestones(evaluationResults, alreadyAwarded);
  if (newMilestones.length > 0) {
    await db.milestone.createMany({
      data: newMilestones.map((m) => ({ goalId, type: m.type, threshold: m.threshold })),
    });
  }

  return NextResponse.json({ entry, newMilestones });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/entries/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/entries
git commit -m "feat: add entry check-in API wired to streak and milestone logic"
```

---

### Task 10: Frontend design pass — tokens and shared components

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Create: `src/components/CategoryBadge.tsx`

**Interfaces:**
- Produces: Tailwind theme extensions (`colors`, `fontFamily`) and a
  `CategoryBadge` component (`{ name: string; color: string; icon: string }`)
  used by Tasks 11–14.

- [ ] **Step 1: Load frontend-design guidance**

Before touching styles, invoke the `frontend-design` skill for
typography/color/layout guidance, and apply its recommendations to the
steps below instead of using Tailwind's defaults verbatim — this step
exists specifically to avoid a generic-looking dashboard.

- [ ] **Step 2: Extend the Tailwind theme**

Edit `tailwind.config.ts` to add a calm, distinctive palette (base
neutrals + one accent used sparingly) and a serif or distinctive
display font for headings paired with a clean sans body font, per the
frontend-design guidance gathered in Step 1. Import the chosen Google
Fonts in `src/app/layout.tsx` using `next/font`.

- [ ] **Step 3: Build `CategoryBadge`**

`src/components/CategoryBadge.tsx`:

```tsx
export function CategoryBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: color, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
```

- [ ] **Step 4: Manually verify**

Run `npm run dev`, confirm fonts load and the badge renders correctly
with a sample color on a throwaway test page (remove afterwards).

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts src/app/globals.css src/app/layout.tsx src/components/CategoryBadge.tsx
git commit -m "feat: establish visual design tokens and CategoryBadge component"
```

---

### Task 11: Dashboard page — today's goals and quick check-in

**Files:**
- Create: `src/components/GoalCard.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/goals` (Task 8), `POST /api/entries` (Task 9),
  `CategoryBadge` (Task 10).
- Produces: dashboard UI reachable at `/`.

- [ ] **Step 1: Build `GoalCard`**

`src/components/GoalCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CategoryBadge } from "@/components/CategoryBadge";

interface Goal {
  id: string;
  title: string;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  category: { name: string; color: string } | null;
}

export function GoalCard({ goal, onChecked }: { goal: Goal; onChecked: () => void }) {
  const [done, setDone] = useState(false);
  const [value, setValue] = useState("");

  async function checkIn(newDone: boolean, newValue?: number) {
    const today = new Date().toISOString().slice(0, 10);
    await fetch("/api/entries", {
      method: "POST",
      body: JSON.stringify({ goalId: goal.id, date: today, done: newDone, value: newValue }),
    });
    onChecked();
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="space-y-1">
        <p className="font-medium">{goal.title}</p>
        {goal.category && <CategoryBadge name={goal.category.name} color={goal.category.color} />}
      </div>
      {goal.type === "boolean" ? (
        <Checkbox
          checked={done}
          onCheckedChange={(checked) => {
            const next = checked === true;
            setDone(next);
            checkIn(next);
          }}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-20"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => value && checkIn(Number(value) >= (goal.targetValue ?? 0), Number(value))}
          />
          <span className="text-sm text-muted-foreground">/ {goal.targetValue} {goal.unit}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the dashboard page**

`src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { GoalCard } from "@/components/GoalCard";

interface Goal {
  id: string;
  title: string;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  category: { name: string; color: string } | null;
}

export default function DashboardPage() {
  const [goals, setGoals] = useState<Goal[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/goals");
    if (res.ok) setGoals(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Heute</h1>
      {goals.length === 0 && <p className="text-muted-foreground">Noch keine Ziele angelegt.</p>}
      <div className="space-y-3">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} onChecked={load} />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Manually verify**

Run `npm run dev`, log in, create a goal via a direct API call or via
Task 12's form (build order may be swapped if easier), confirm it
appears on the dashboard and checking it off calls the API without
errors (check network tab).

- [ ] **Step 4: Commit**

```bash
git add src/components/GoalCard.tsx src/app/page.tsx
git commit -m "feat: add dashboard with today's goals and quick check-in"
```

---

### Task 12: New Goal form page

**Files:**
- Create: `src/components/GoalForm.tsx`
- Create: `src/app/goals/new/page.tsx`

**Interfaces:**
- Consumes: `GET /api/categories` (Task 7), `POST /api/goals` (Task 8).
- Produces: form UI reachable at `/goals/new`, redirects to `/` on
  success.

- [ ] **Step 1: Build `GoalForm`**

`src/components/GoalForm.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Category {
  id: string;
  name: string;
}

export function GoalForm() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"boolean" | "quantitative">("boolean");
  const [periodicity, setPeriodicity] = useState<"daily" | "weekly">("daily");
  const [unit, setUnit] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [weeklyThreshold, setWeeklyThreshold] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/categories").then((res) => res.json()).then(setCategories);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/goals", {
      method: "POST",
      body: JSON.stringify({
        title,
        type,
        periodicity,
        unit: type === "quantitative" ? unit : undefined,
        targetValue: type === "quantitative" ? Number(targetValue) : undefined,
        weeklyThreshold: periodicity === "weekly" ? Number(weeklyThreshold) : undefined,
        categoryId,
      }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Fehler beim Anlegen.");
      return;
    }
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Titel</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>Typ</Label>
        <Select value={type} onValueChange={(v) => setType(v as "boolean" | "quantitative")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="boolean">Erledigt / nicht erledigt</SelectItem>
            <SelectItem value="quantitative">Messbare Menge</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {type === "quantitative" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="targetValue">Zielwert</Label>
            <Input id="targetValue" type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Einheit</Label>
            <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="z.B. Liter" required />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Periodizität</Label>
        <Select value={periodicity} onValueChange={(v) => setPeriodicity(v as "daily" | "weekly")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Täglich</SelectItem>
            <SelectItem value="weekly">Wöchentlich</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {periodicity === "weekly" && (
        <div className="space-y-2">
          <Label htmlFor="weeklyThreshold">An wie vielen von 7 Tagen mindestens?</Label>
          <Input id="weeklyThreshold" type="number" min={1} max={7} value={weeklyThreshold} onChange={(e) => setWeeklyThreshold(e.target.value)} required />
        </div>
      )}

      <div className="space-y-2">
        <Label>Kategorie</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger><SelectValue placeholder="Keine" /></SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit">Ziel anlegen</Button>
    </form>
  );
}
```

- [ ] **Step 2: Build the page**

`src/app/goals/new/page.tsx`:

```tsx
import { GoalForm } from "@/components/GoalForm";

export default function NewGoalPage() {
  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Neues Ziel</h1>
      <GoalForm />
    </main>
  );
}
```

- [ ] **Step 3: Manually verify**

Run `npm run dev`, go to `/goals/new`, create one boolean/daily goal and
one quantitative/weekly goal, confirm both show up on the dashboard.

- [ ] **Step 4: Commit**

```bash
git add src/components/GoalForm.tsx src/app/goals/new
git commit -m "feat: add new goal creation form"
```

---

### Task 13: Goal detail page — Heatmap and trend chart

**Files:**
- Create: `src/components/Heatmap.tsx`
- Create: `src/components/TrendChart.tsx`
- Create: `src/app/goals/[id]/page.tsx`
- Create: `src/app/api/goals/[id]/history/route.ts`

**Interfaces:**
- Consumes: `db`, `authOptions`.
- Produces: `GET /api/goals/[id]/history` → `{ goal, results: DailyResult[], milestones: Milestone[] }`
  where `results` covers the last 365 days. `Heatmap` takes
  `{ results: { date: string; success: boolean }[] }`. `TrendChart`
  takes `{ results: { date: string; success: boolean }[] }` and renders
  a rolling 7-day success-rate line.

- [ ] **Step 1: Implement the history API route**

`src/app/api/goals/[id]/history/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const goal = await db.goal.findUnique({ where: { id: params.id } });
  if (!goal || goal.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const since = new Date();
  since.setDate(since.getDate() - 365);

  const entries = await db.entry.findMany({
    where: { goalId: goal.id, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  const results = entries.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
  }));

  const milestones = await db.milestone.findMany({ where: { goalId: goal.id }, orderBy: { achievedAt: "asc" } });

  return NextResponse.json({ goal, results, milestones });
}
```

- [ ] **Step 2: Build `Heatmap`**

`src/components/Heatmap.tsx`:

```tsx
interface DayResult {
  date: string;
  success: boolean;
}

export function Heatmap({ results }: { results: DayResult[] }) {
  const byDate = new Map(results.map((r) => [r.date, r.success]));
  const days: { date: string; success: boolean | null }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 364);
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({ date: key, success: byDate.has(key) ? (byDate.get(key) as boolean) : null });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const colorFor = (success: boolean | null) =>
    success === null ? "bg-muted" : success ? "bg-emerald-500" : "bg-red-200";

  return (
    <div className="flex gap-1 overflow-x-auto pb-2">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-1">
          {week.map((day) => (
            <div key={day.date} title={day.date} className={`h-3 w-3 rounded-sm ${colorFor(day.success)}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build `TrendChart`**

```bash
npm install recharts
```

`src/components/TrendChart.tsx`:

```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DayResult {
  date: string;
  success: boolean;
}

function rollingSuccessRate(results: DayResult[], windowSize = 7) {
  return results.map((_, i) => {
    const window = results.slice(Math.max(0, i - windowSize + 1), i + 1);
    const rate = window.filter((r) => r.success).length / window.length;
    return { date: results[i].date, rate: Math.round(rate * 100) };
  });
}

export function TrendChart({ results }: { results: DayResult[] }) {
  const data = rollingSuccessRate(results);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="date" tick={false} />
        <YAxis domain={[0, 100]} unit="%" width={40} />
        <Tooltip formatter={(value: number) => [`${value}%`, "Erfolgsquote (7 Tage)"]} />
        <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Build the goal detail page**

`src/app/goals/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";

interface HistoryResponse {
  goal: { title: string };
  results: { date: string; success: boolean }[];
  milestones: { type: string; threshold: number; achievedAt: string }[];
}

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<HistoryResponse | null>(null);

  useEffect(() => {
    fetch(`/api/goals/${params.id}/history`)
      .then((res) => res.json())
      .then(setData);
  }, [params.id]);

  if (!data) return <main className="p-6">Lädt…</main>;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{data.goal.title}</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Letzte 12 Monate</h2>
        <Heatmap results={data.results} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Trend (7-Tage-Erfolgsquote)</h2>
        <TrendChart results={data.results} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Meilensteine</h2>
        {data.milestones.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Meilensteine.</p>}
        <ul className="space-y-1">
          {data.milestones.map((m, i) => (
            <li key={i} className="text-sm">
              🏆 {m.type === "streak" ? `${m.threshold}-Tage-Streak` : `${m.threshold}x insgesamt geschafft`}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Manually verify**

Run `npm run dev`, click into a goal from the dashboard (add a link from
`GoalCard` title to `/goals/[id]` if not already navigable), confirm the
heatmap and chart render without console errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/Heatmap.tsx src/components/TrendChart.tsx src/app/goals/[id] src/app/api/goals/[id]/history package.json package-lock.json
git commit -m "feat: add goal detail page with heatmap and trend chart"
```

---

### Task 14: Stats page — aggregate heatmap and filterable trend

**Files:**
- Create: `src/app/api/stats/route.ts`
- Create: `src/app/stats/page.tsx`

**Interfaces:**
- Consumes: `db`, `authOptions`, `Heatmap`, `TrendChart` (Task 13).
- Produces: `GET /api/stats?days=30` → aggregated
  `{ date: string; successCount: number; totalCount: number }[]` across
  all of the user's active goals, and `/stats` page rendering it.

- [ ] **Step 1: Implement the stats API route**

`src/app/api/stats/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") ?? 30);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const goals = await db.goal.findMany({ where: { userId, archived: false } });
  const entries = await db.entry.findMany({
    where: { goalId: { in: goals.map((g) => g.id) }, date: { gte: since } },
  });

  const goalById = new Map(goals.map((g) => [g.id, g]));
  const byDate = new Map<string, { successCount: number; totalCount: number }>();

  for (const entry of entries) {
    const goal = goalById.get(entry.goalId)!;
    const key = entry.date.toISOString().slice(0, 10);
    const success = goal.type === "boolean" ? entry.done : (entry.value ?? 0) >= (goal.targetValue ?? Infinity);
    const existing = byDate.get(key) ?? { successCount: 0, totalCount: 0 };
    existing.totalCount += 1;
    if (success) existing.successCount += 1;
    byDate.set(key, existing);
  }

  const result = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Build the stats page**

`src/app/stats/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";

interface DayStat {
  date: string;
  successCount: number;
  totalCount: number;
}

export default function StatsPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<DayStat[]>([]);

  useEffect(() => {
    fetch(`/api/stats?days=${days}`)
      .then((res) => res.json())
      .then(setStats);
  }, [days]);

  const results = stats.map((s) => ({ date: s.date, success: s.totalCount > 0 && s.successCount === s.totalCount }));

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Auswertung</h1>
        <div className="flex gap-2">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-sm ${d === days ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              {d}T
            </button>
          ))}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Gesamt-Heatmap (alle Ziele)</h2>
        <Heatmap results={results} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Trend</h2>
        <TrendChart results={results} />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Manually verify**

Run `npm run dev`, go to `/stats`, toggle time ranges, confirm heatmap
and chart update without errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stats src/app/stats
git commit -m "feat: add aggregate stats page with heatmap and trend chart"
```

---

### Task 15: Milestones page and Settings (category management)

**Files:**
- Create: `src/app/milestones/page.tsx`
- Create: `src/app/api/milestones/route.ts`
- Create: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `db`, `authOptions`, `GET /api/categories`, `POST /api/categories`.
- Produces: `GET /api/milestones` → all milestones for the user's goals
  with goal title attached; `/milestones` and `/settings` pages.

- [ ] **Step 1: Implement the milestones API route**

`src/app/api/milestones/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const milestones = await db.milestone.findMany({
    where: { goal: { userId } },
    include: { goal: { select: { title: true } } },
    orderBy: { achievedAt: "desc" },
  });
  return NextResponse.json(milestones);
}
```

- [ ] **Step 2: Build the milestones page**

`src/app/milestones/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface MilestoneRow {
  id: string;
  type: string;
  threshold: number;
  achievedAt: string;
  goal: { title: string };
}

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);

  useEffect(() => {
    fetch("/api/milestones").then((res) => res.json()).then(setMilestones);
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Meilensteine</h1>
      {milestones.length === 0 && <p className="text-muted-foreground">Noch keine Meilensteine erreicht.</p>}
      <ul className="space-y-3">
        {milestones.map((m) => (
          <li key={m.id} className="rounded-lg border p-4">
            <p className="font-medium">
              🏆 {m.type === "streak" ? `${m.threshold}-Tage-Streak` : `${m.threshold}x insgesamt geschafft`}
            </p>
            <p className="text-sm text-muted-foreground">
              {m.goal.title} · {new Date(m.achievedAt).toLocaleDateString("de-DE")}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Build the settings page (category management)**

`src/app/settings/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryBadge } from "@/components/CategoryBadge";

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export default function SettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");

  function load() {
    fetch("/api/categories").then((res) => res.json()).then(setCategories);
  }

  useEffect(load, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name, color, icon: "tag" }),
    });
    setName("");
    load();
  }

  return (
    <main className="mx-auto max-w-lg space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Kategorien</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <CategoryBadge key={c.id} name={c.name} color={c.color} />
          ))}
        </div>
        <form onSubmit={addCategory} className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="catName">Name</Label>
            <Input id="catName" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="catColor">Farbe</Label>
            <Input id="catColor" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 p-1" />
          </div>
          <Button type="submit">Hinzufügen</Button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Manually verify**

Run `npm run dev`, add a category in `/settings`, confirm it shows up in
the `/goals/new` category dropdown; reach a 7-day streak on a test goal
and confirm it appears on `/milestones`.

- [ ] **Step 5: Commit**

```bash
git add src/app/milestones src/app/api/milestones src/app/settings
git commit -m "feat: add milestones overview and settings/category management pages"
```

---

### Task 16: Navigation shell and route protection

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `authOptions` (Task 6).
- Produces: a persistent nav bar (Dashboard / Stats / Milestones /
  Settings / Logout) on all authenticated pages, and middleware that
  redirects unauthenticated users to `/login`.

- [ ] **Step 1: Add route protection middleware**

`src/middleware.ts`:

```typescript
export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/", "/goals/:path*", "/stats", "/milestones", "/settings"],
};
```

- [ ] **Step 2: Add a nav bar to the root layout**

Edit `src/app/layout.tsx` to wrap children with a top nav bar containing
links to `/`, `/stats`, `/milestones`, `/settings`, and a "Logout" button
that calls `signOut()` from `next-auth/react`. Keep `/login` and
`/register` free of the nav bar by checking `usePathname()` in a small
client component, e.g. `src/components/NavBar.tsx`, and rendering
`null` there.

`src/components/NavBar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/", label: "Heute" },
  { href: "/stats", label: "Auswertung" },
  { href: "/milestones", label: "Meilensteine" },
  { href: "/settings", label: "Einstellungen" },
];

export function NavBar() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <nav className="flex items-center justify-between border-b px-6 py-3">
      <div className="flex gap-4">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? "font-semibold" : "text-muted-foreground"}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/login" })}>
        Abmelden
      </Button>
    </nav>
  );
}
```

Add `<NavBar />` inside the `<body>` of `src/app/layout.tsx`, above
`{children}`, and wrap the tree in NextAuth's `SessionProvider` via a
small client wrapper component so `signOut`/`useSession` work.

- [ ] **Step 3: Manually verify**

Run `npm run dev`. Logged out, confirm visiting `/` redirects to
`/login`. Logged in, confirm the nav bar appears on all pages except
login/register, and Logout returns to `/login`.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts src/components/NavBar.tsx src/app/layout.tsx
git commit -m "feat: add navigation shell and protect authenticated routes"
```

---

## Post-plan checklist (not a task — verify before calling the MVP done)

- [ ] `npx vitest run` passes with zero failures
- [ ] `npm run build` succeeds
- [ ] Manual walkthrough: register → login → create a daily boolean goal
  and a weekly quantitative goal → check in on both for several
  simulated days (adjust dates via direct API calls if needed to test
  streaks faster) → confirm heatmap, trend chart, and a 7-day milestone
  all appear correctly → log out

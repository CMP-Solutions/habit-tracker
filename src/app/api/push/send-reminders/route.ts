import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pushConfigured, webpush } from "@/lib/push";
import { utcToday } from "@/lib/domain/window";

// Not user-authenticated: this is meant to be called by a local cron job (see
// README), not a signed-in browser, so it's protected by a shared secret
// instead of a session cookie.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pushConfigured) {
    return NextResponse.json({ error: "Push is not configured (missing VAPID env vars)." }, { status: 500 });
  }

  const today = utcToday();
  const usersWithSubscriptions = await db.user.findMany({
    where: { pushSubscriptions: { some: {} } },
    include: { pushSubscriptions: true, goals: { where: { archived: false } } },
  });

  let notified = 0;
  for (const user of usersWithSubscriptions) {
    if (user.goals.length === 0) continue;

    const todaysEntries = await db.entry.findMany({
      where: { goalId: { in: user.goals.map((g) => g.id) }, date: today },
    });
    const entryByGoal = new Map(todaysEntries.map((e) => [e.goalId, e]));

    const openCount = user.goals.filter((goal) => {
      const entry = entryByGoal.get(goal.id);
      if (!entry) return true;
      return goal.type === "boolean" ? !entry.done : (entry.value ?? 0) < (goal.targetValue ?? Infinity);
    }).length;

    if (openCount === 0) continue;

    const payload = JSON.stringify({
      title: "Ritual",
      body: openCount === 1 ? "Du hast heute noch 1 offenes Ziel." : `Du hast heute noch ${openCount} offene Ziele.`,
    });

    for (const sub of user.pushSubscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        notified++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    }
  }

  return NextResponse.json({ notified });
}

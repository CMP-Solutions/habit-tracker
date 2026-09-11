"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryBadge } from "@/components/CategoryBadge";
import { getExistingPushSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";

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
  const [error, setError] = useState<string | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState<boolean | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    getExistingPushSubscription().then((sub) => setPushSubscribed(!!sub));
  }, []);

  async function togglePush() {
    setPushError(null);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
      } else {
        await subscribeToPush();
        setPushSubscribed(true);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Erinnerungen konnten nicht aktiviert werden.");
    }
  }

  function load() {
    fetch("/api/categories").then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Kategorien konnten nicht geladen werden.");
        return;
      }
      setError(null);
      setCategories(await res.json());
    });
  }

  useEffect(load, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name, color, icon: "tag" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Kategorie konnte nicht angelegt werden.");
      return;
    }
    setError(null);
    setName("");
    load();
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-8 px-6 py-10">
      <h1 className="font-heading text-3xl">Einstellungen</h1>

      <section className="space-y-4 rounded-xl border bg-card p-6 backdrop-blur-xl">
        <h2 className="text-sm font-medium text-muted-foreground">Kategorien</h2>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 border-b pb-4">
            {categories.map((c) => (
              <CategoryBadge key={c.id} name={c.name} color={c.color} />
            ))}
          </div>
        )}
        <form onSubmit={addCategory} className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="catName">Name</Label>
            <Input id="catName" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Gesundheit" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="catColor">Farbe</Label>
            <Input id="catColor" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 p-1" />
          </div>
          <Button type="submit">Hinzufügen</Button>
        </form>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-6 backdrop-blur-xl">
        <h2 className="text-sm font-medium text-muted-foreground">Erinnerungen</h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-foreground">
            Browser-Benachrichtigung, wenn abends noch Ziele offen sind.
          </p>
          <Button
            variant={pushSubscribed ? "outline" : "default"}
            size="sm"
            onClick={togglePush}
            disabled={pushSubscribed === null}
          >
            {pushSubscribed ? "Deaktivieren" : "Aktivieren"}
          </Button>
        </div>
        {pushError && <p className="text-sm text-destructive">{pushError}</p>}
      </section>
    </main>
  );
}

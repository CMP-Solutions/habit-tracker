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
  const [error, setError] = useState<string | null>(null);

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
    <main className="mx-auto max-w-lg space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Kategorien</h2>
        {error && <p className="text-sm text-destructive">{error}</p>}
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

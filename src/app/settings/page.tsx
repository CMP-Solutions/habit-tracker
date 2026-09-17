"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryBadge } from "@/components/CategoryBadge";
import { listCategories, createCategory } from "@/lib/storage/categories";
import { isRemindersEnabled, enableReminders, disableReminders } from "@/lib/reminders";
import { exportData, importData } from "@/lib/storage/backup";
import { useUserName, useUpdateUserName } from "@/components/OnboardingGate";

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
  const currentUserName = useUserName();
  const updateUserName = useUpdateUserName();
  const [profileName, setProfileName] = useState(currentUserName ?? "");
  const [profileSaved, setProfileSaved] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(() => isRemindersEnabled());
  const [pushError, setPushError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  async function togglePush() {
    setPushError(null);
    try {
      if (pushSubscribed) {
        disableReminders();
        setPushSubscribed(false);
      } else {
        await enableReminders();
        setPushSubscribed(true);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Erinnerungen konnten nicht aktiviert werden.");
    }
  }

  function load() {
    listCategories().then(setCategories);
  }

  function handleSaveProfileName(e: React.FormEvent) {
    e.preventDefault();
    if (!profileName.trim()) return;
    updateUserName(profileName);
    setProfileSaved(true);
  }

  useEffect(load, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCategory({ name, color, icon: "tag" });
      setError(null);
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategorie konnte nicht angelegt werden.");
    }
  }

  async function handleExport() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ritual-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    if (!window.confirm("Import ersetzt alle aktuell auf diesem Gerät gespeicherten Daten. Fortfahren?")) return;

    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setImportError("Die Datei ist kein gültiges JSON.");
      return;
    }
    try {
      await importData(parsed);
      setImportSuccess(true);
      load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-8 px-6 py-10">
      <h1 className="font-heading text-3xl">Einstellungen</h1>

      <section className="space-y-4 rounded-xl border bg-card p-6 backdrop-blur-xl">
        <h2 className="text-sm font-medium text-muted-foreground">Profil</h2>
        <form
          onSubmit={handleSaveProfileName}
          className="flex items-end gap-2"
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="profileName">Name</Label>
            <Input
              id="profileName"
              value={profileName}
              onChange={(e) => {
                setProfileName(e.target.value);
                setProfileSaved(false);
              }}
              required
            />
          </div>
          <Button type="submit">Speichern</Button>
        </form>
        {profileSaved && <p className="text-sm text-primary">Gespeichert.</p>}
      </section>

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
          >
            {pushSubscribed ? "Deaktivieren" : "Aktivieren"}
          </Button>
        </div>
        {pushError && <p className="text-sm text-destructive">{pushError}</p>}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-6 backdrop-blur-xl">
        <h2 className="text-sm font-medium text-muted-foreground">Daten</h2>
        <p className="text-sm text-foreground">
          Deine Daten liegen nur in diesem Browser. Für ein Backup oder einen Gerätewechsel: exportieren und auf
          dem neuen Gerät wieder einlesen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            Daten exportieren
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Daten importieren
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
        {importSuccess && <p className="text-sm text-primary">Import erfolgreich.</p>}
        {importError && <p className="text-sm text-destructive">{importError}</p>}
      </section>
    </main>
  );
}

"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <p className="text-center font-heading text-2xl">Ritual</p>
        <div className="space-y-6 rounded-xl border bg-card p-6 backdrop-blur-xl">
          <h1 className="font-heading text-2xl">Anmelden</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">Anmelden</Button>
          </form>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Noch kein Konto?{" "}
          <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Registrieren
          </Link>
        </p>
      </div>
    </div>
  );
}

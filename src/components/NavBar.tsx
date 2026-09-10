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

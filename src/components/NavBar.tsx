"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, BarChart3, Trophy, Settings, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const LINKS = [
  { href: "/", label: "Heute", icon: Home },
  { href: "/woche", label: "Woche", icon: CalendarDays },
  { href: "/stats", label: "Auswertung", icon: BarChart3 },
  { href: "/milestones", label: "Meilensteine", icon: Trophy },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop/tablet: full text nav. Hidden on phone widths, where five
          labels plus logout never fit without truncating. */}
      <nav className="sticky top-0 z-40 hidden items-center gap-2 border-b bg-card/60 px-6 backdrop-blur-xl sm:flex">
        <span className="shrink-0 font-heading text-lg text-foreground">Ritual</span>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative shrink-0 px-3 py-4 text-sm whitespace-nowrap transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </div>
        <Link href="/goals/new" className={buttonVariants({ size: "sm", className: "shrink-0" })}>
          <Plus /> Neues Ziel
        </Link>
      </nav>

      {/* Phone: compact top bar (logo). */}
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b bg-card/60 px-4 py-3 backdrop-blur-xl sm:hidden">
        <span className="font-heading text-lg text-foreground">Ritual</span>
      </nav>

      {/* ...plus a fixed icon tab bar for navigation, the standard mobile
          pattern for a small fixed set of top-level destinations. "Neues
          Ziel" is an action, not a destination, so it's always
          primary-colored rather than toggling on pathname match. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
        {LINKS.slice(0, 2).map((link) => (
          <TabLink key={link.href} link={link} active={pathname === link.href} />
        ))}
        <Link
          href="/goals/new"
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground transition-colors"
        >
          {/* A filled badge, not a text color, marks this as an action button —
              plain primary text would be indistinguishable from an active
              destination tab (see the mobile-adaptation critique finding). */}
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-4" />
          </span>
          Neu
        </Link>
        {LINKS.slice(2).map((link) => (
          <TabLink key={link.href} link={link} active={pathname === link.href} />
        ))}
      </nav>
    </>
  );
}

function TabLink({
  link,
  active,
}: {
  link: { href: string; label: string; icon: typeof Home };
  active: boolean;
}) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className="size-5" />
      {link.label}
    </Link>
  );
}

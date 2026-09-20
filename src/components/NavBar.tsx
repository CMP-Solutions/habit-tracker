"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, CalendarRange, BarChart3, Trophy, Settings, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CmpLogo } from "@/components/CmpLogo";
import { NewMenu } from "@/components/NewMenu";

const LINKS = [
  { href: "/", label: "Heute", icon: Home },
  { href: "/woche", label: "Woche", icon: CalendarDays },
  { href: "/kalender", label: "Kalender", icon: CalendarRange },
  { href: "/stats", label: "Auswertung", icon: BarChart3 },
  { href: "/milestones", label: "Meilensteine", icon: Trophy },
  { href: "/settings", label: "Optionen", icon: Settings },
];

// The "Neu" button must sit dead center of the mobile tab bar, so the links
// are split evenly around it (needs an even number of LINKS).
const TAB_BAR_HALF = LINKS.length / 2;

export function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop/tablet: full text nav. Hidden on phone widths, where five
          labels plus logout never fit without truncating. */}
      <nav className="sticky top-0 z-40 hidden items-center gap-2 border-b bg-card/60 px-6 backdrop-blur-xl sm:flex">
        <span className="flex shrink-0 items-center gap-2 font-heading text-lg text-foreground">
          <CmpLogo className="size-5" />
          Ritual
        </span>
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
        <NewMenu side="bottom" triggerClassName={buttonVariants({ size: "sm", className: "shrink-0" })}>
          <Plus /> Neu
        </NewMenu>
      </nav>

      {/* Phone: compact top bar (logo). */}
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b bg-card/60 px-4 py-3 backdrop-blur-xl sm:hidden">
        <span className="flex items-center gap-2 font-heading text-lg text-foreground">
          <CmpLogo className="size-5" />
          Ritual
        </span>
      </nav>

      {/* ...plus a fixed icon tab bar for navigation, the standard mobile
          pattern for a small fixed set of top-level destinations. "Neues
          Ziel" is an action, not a destination, so it's always
          primary-colored rather than toggling on pathname match. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center border-t bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
        {/* Both sides are the same width no matter how long their labels are
            (minmax(0,1fr)), so the "Neu" column in between is always dead
            center of the bar. */}
        <div className="flex items-center justify-around">
          {LINKS.slice(0, TAB_BAR_HALF).map((link) => (
            <TabLink key={link.href} link={link} active={pathname === link.href} />
          ))}
        </div>
        {/* A filled badge, not a text color, marks this as an action button —
            plain primary text would be indistinguishable from an active
            destination tab (see the mobile-adaptation critique finding). */}
        <NewMenu
          side="top"
          align="center"
          triggerClassName="flex w-full flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground transition-colors"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-4" />
          </span>
          Neu
        </NewMenu>
        <div className="flex items-center justify-around">
          {LINKS.slice(TAB_BAR_HALF).map((link) => (
            <TabLink key={link.href} link={link} active={pathname === link.href} />
          ))}
        </div>
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
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors max-[400px]:text-[9.5px] max-[350px]:text-[9px] ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className="size-5" />
      {link.label}
    </Link>
  );
}

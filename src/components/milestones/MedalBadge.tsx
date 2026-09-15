"use client";

import { CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { MilestoneTier } from "./tiers";

type MedalState = "achieved" | "active" | "locked";

const SIZE_CLASSES = { sm: "size-9", md: "size-11" } as const;
const ICON_SIZE_CLASSES = { sm: "size-4", md: "size-5" } as const;

/**
 * One medal in a tier ladder. `achieved` tiers stay permanently unlocked
 * (a broken streak never revokes an earlier win) so they render grayed out
 * with a checkmark rather than losing their color entirely — dimmed enough
 * to read as "done", not so faint it looks unearned. `active` is the next
 * tier still open to reach, shown in the tier's own color with a progress
 * ring. `locked` tiers further out are a bare outline: visible as "exists"
 * without implying any progress toward them yet.
 */
export function MedalBadge({
  tier,
  state,
  progress,
  size = "md",
  details,
}: {
  tier: MilestoneTier;
  state: MedalState;
  /** 0-1, only meaningful for `active`. */
  progress?: number;
  size?: "sm" | "md";
  details: React.ReactNode;
}) {
  const Icon = tier.icon;
  const percent = Math.round(Math.min(Math.max(progress ?? 0, 0), 1) * 100);

  return (
    <Popover>
      <PopoverTrigger
        className={`relative flex shrink-0 items-center justify-center rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-95 ${SIZE_CLASSES[size]} ${
          state === "achieved"
            ? "bg-muted text-muted-foreground ring-1 ring-border"
            : state === "active"
              ? `ring-2 ${tier.activeClassName}`
              : "text-muted-foreground/40 ring-1 ring-border/60"
        }`}
        aria-label={`${tier.name}${state === "locked" ? " (noch nicht erreichbar)" : ""}`}
      >
        {state === "active" && (
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40" aria-hidden>
            <circle cx="20" cy="20" r="18" fill="none" strokeWidth="2" className="stroke-current opacity-20" />
            <circle
              cx="20"
              cy="20"
              r="18"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className="stroke-current"
              strokeDasharray={`${(percent / 100) * 113.1} 113.1`}
            />
          </svg>
        )}
        <Icon className={ICON_SIZE_CLASSES[size]} />
        {state === "achieved" && (
          <CheckCircle2 className="absolute -right-1 -bottom-1 size-4 rounded-full bg-background text-celebrate" />
        )}
      </PopoverTrigger>
      <PopoverContent>{details}</PopoverContent>
    </Popover>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A single "create new" entry point that picks between the two things this
 * app lets you create — a recurring Goal or a one-off ToDo — instead of the
 * nav bar committing to one or the other. Controlled `open` state (rather
 * than letting the popover manage its own) so a click on either link can
 * close the menu before the route change completes; NavBar persists across
 * navigations, so an uncontrolled popover would stay visually open.
 */
export function NewMenu({
  triggerClassName,
  side = "bottom",
  align = "end",
  children,
}: {
  triggerClassName?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName}>{children}</PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-44 space-y-1 p-1">
        <Link
          href="/goals/new"
          onClick={() => setOpen(false)}
          className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          Neues Ziel
        </Link>
        <Link
          href="/todos/new"
          onClick={() => setOpen(false)}
          className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          Neues ToDo
        </Link>
        <Link
          href="/kalender/new"
          onClick={() => setOpen(false)}
          className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          Neuer Termin
        </Link>
      </PopoverContent>
    </Popover>
  );
}

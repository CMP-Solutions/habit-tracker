"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserName, setUserName, possessive } from "@/lib/user";
import { CmpLogo } from "@/components/CmpLogo";

type Phase = "loading" | "prompt" | "welcome" | "app";

const UserNameContext = createContext<string | null>(null);

/** The name entered on first use, once the onboarding gate has resolved. */
export function useUserName(): string | null {
  return useContext(UserNameContext);
}

/**
 * Blocks the app behind a one-time "Wie heißt du?" prompt on first use,
 * then shows a brief animated welcome before revealing the app. The
 * children are mounted (hidden) throughout, not just after "app" — so
 * whatever page is underneath has already loaded its own data by the
 * time the overlay clears, instead of flashing its own loading state
 * right after the welcome animation.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [name, setName] = useState("");
  const [input, setInput] = useState("");
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    Promise.resolve().then(() => {
      const existing = getUserName();
      if (existing) {
        setName(existing);
        setPhase("app");
      } else {
        setPhase("prompt");
      }
    });
  }, []);

  useEffect(() => {
    if (phase !== "welcome") return;
    const delay = reducedMotion ? 400 : 1700;
    const timer = setTimeout(() => setPhase("app"), delay);
    return () => clearTimeout(timer);
  }, [phase, reducedMotion]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setUserName(trimmed);
    setName(trimmed);
    setPhase("welcome");
  }

  return (
    <UserNameContext.Provider value={phase === "app" ? name : null}>
      {phase === "app" ? (
        children
      ) : (
        <div aria-hidden className="pointer-events-none opacity-0">
          {children}
        </div>
      )}

      <AnimatePresence>
        {(phase === "prompt" || phase === "welcome") && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6"
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.05 : 0.5 }}
          >
            <AnimatePresence mode="wait">
              {phase === "prompt" && (
                <motion.div key="prompt" layoutId="onboarding-surface" className="w-full max-w-sm space-y-8">
                  <p className="text-center font-heading text-2xl">Ritual</p>
                  <div className="space-y-6 rounded-xl border bg-card p-6 backdrop-blur-xl">
                    <h1 className="font-heading text-2xl">Wie heißt du?</h1>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                          id="name"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          autoFocus
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full">
                        Los geht&apos;s
                      </Button>
                    </form>
                  </div>
                  {/* Below the card, not above it — visible without being the
                      first thing read, since it's a caveat, not the point of
                      this screen. */}
                  <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                    <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
                    Im Inkognito-/privaten Modus werden deine Daten nicht gespeichert.
                  </p>
                </motion.div>
              )}
              {phase === "welcome" && (
                <motion.div
                  key="welcome"
                  layoutId="onboarding-surface"
                  className="w-full max-w-sm rounded-xl border bg-card p-10 text-center backdrop-blur-xl"
                >
                  <motion.div
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      duration: reducedMotion ? 0.05 : 0.6,
                      ease: reducedMotion ? "linear" : [0.34, 1.56, 0.64, 1],
                    }}
                    className="mx-auto mb-5 flex flex-col items-center gap-2"
                  >
                    <CmpLogo className="size-12 drop-shadow-[0_0_18px_rgba(99,140,255,0.55)]" />
                    <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                      by CMP Solutions
                    </p>
                  </motion.div>
                  <motion.p
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reducedMotion ? 0 : 0.2, duration: reducedMotion ? 0.05 : 0.5 }}
                    className="font-heading text-3xl text-foreground"
                  >
                    Willkommen, {name}
                  </motion.p>
                  <motion.p
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: reducedMotion ? 0 : 0.45, duration: reducedMotion ? 0.05 : 0.5 }}
                    className="mt-2 text-sm text-muted-foreground"
                  >
                    Los geht&apos;s mit {possessive(name)} Ritual.
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </UserNameContext.Provider>
  );
}

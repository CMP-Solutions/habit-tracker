---
name: Ritual
description: A quiet, editorial habit tracker — a ledger for recurring goals, not a To-Do app.
colors:
  deep-petrol-ink: "oklch(0.755 0.085 196)"
  deep-petrol-ink-foreground: "oklch(0.21 0.03 200)"
  warm-gold: "oklch(0.75 0.13 85)"
  warm-gold-foreground: "oklch(0.97 0.03 90)"
  aurora-violet: "oklch(0.58 0.16 300)"
  canvas-base: "oklch(0.16 0.02 250)"
  foreground: "oklch(0.945 0.005 210)"
  card-glass: "oklch(0.32 0.02 225 / 55%)"
  popover: "oklch(0.228 0.013 225)"
  surface-secondary: "oklch(0.285 0.014 222)"
  surface-secondary-foreground: "oklch(0.945 0.005 210)"
  muted: "oklch(0.275 0.013 222)"
  muted-foreground: "oklch(0.705 0.012 215)"
  accent: "oklch(0.3 0.022 200)"
  accent-foreground: "oklch(0.9 0.04 196)"
  destructive: "oklch(0.665 0.16 25)"
  border: "oklch(0.98 0.01 210 / 11%)"
  input-border: "oklch(0.98 0.01 210 / 16%)"
  ring: "oklch(0.62 0.07 196)"
  chart-1: "oklch(0.35 0.05 197)"
  chart-2: "oklch(0.45 0.065 196)"
  chart-3: "oklch(0.56 0.075 196)"
  chart-4: "oklch(0.67 0.085 196)"
  chart-5: "oklch(0.8 0.075 196)"
typography:
  display:
    fontFamily: "Newsreader, ui-serif, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Newsreader, ui-serif, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Newsreader, ui-serif, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  3xl: "1.375rem"
  4xl: "1.625rem"
components:
  button-primary:
    backgroundColor: "{colors.deep-petrol-ink}"
    textColor: "{colors.deep-petrol-ink-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  card:
    backgroundColor: "{colors.card-glass}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  badge-default:
    backgroundColor: "{colors.deep-petrol-ink}"
    textColor: "{colors.deep-petrol-ink-foreground}"
    rounded: "{rounded.4xl}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
---

# Design System: Ritual

## Overview

**Creative North Star: "The Quiet Ledger"**

Ritual reads like a handwritten ledger, not a dashboard. Its two typefaces do the framing: Newsreader, a low-contrast reading serif, sets dates, section titles and the app's wordmark with a calm, editorial voice; IBM Plex Mono sets every number — streaks, dates, percentages, quantities — so figures line up and read as measured fact rather than decoration. Hanken Grotesk carries everything else at a quiet, humanist register. The result is closer to a bound notebook than a habit-tracking product: the interface disappears, the record of what was done does not.

Color follows the same discipline. Deep Petrol Ink is the system's only real accent — reserved for primary actions, focus rings, and progress — and it appears on a deliberately small share of any screen. Warm Gold is not a palette color at all; it is a single reserved signal for the one moment the product cares most about, a goal completed for the day. It never appears anywhere else — not as a hover state, not as a decorative highlight. A slow-drifting Aurora Violet field lives only in the fixed background behind glass cards; it is atmosphere, never UI. Category colors, chosen per-goal by the user, are the only other color the interface shows — everything structural stays neutral so a category dot or accent border reads as real information, not noise.

The product currently ships dark-only: `RootLayout` hardcodes the `dark` class on `<html>`. A complete light palette exists in `:root` in `globals.css` and is visually coherent (flat cards, ring borders, opaque canvas), but nothing in the UI currently lets a user reach it — treat it as a maintained but dormant second theme, not dead code to remove.

**Key Characteristics:**
- Editorial serif for headings/titles, monospace for every number, humanist sans for body copy — three typefaces, each with exactly one job.
- One accent (Deep Petrol Ink) used sparingly; one reserved signal color (Warm Gold) used for exactly one event.
- Dark-only in practice today; a complete, unused light theme is maintained in the same tokens.
- Flat surfaces with thin rings in the (dormant) light theme; translucent glass panels over a drifting aurora field in the shipped dark theme.

## Colors

Cool, low-saturation neutrals (hue ~205–225) throughout, so the one warm hue (Warm Gold) and any per-goal category color are the only saturated colors a user sees.

### Primary
- **Deep Petrol Ink** (`oklch(0.755 0.085 196)`): the system's only structural accent — primary buttons, links, focus rings, active nav indicator, the primary progress ring, and the default heatmap "done" cell. Reserved for primary actions and real progress signals, not decoration.

### Secondary
- **Warm Gold** (`oklch(0.75 0.13 85)`): reserved exclusively for the moment a goal is completed for the day — the checkbox's checked state, the completed-quantitative-goal badge, and the `goal-complete-pop` micro-animation's glow. Never used for any other UI state.

### Tertiary
- **Aurora Violet** (`oklch(0.58 0.16 300)`): background-only. Used solely as one of three blurred, screen-blended blobs in the fixed `.aurora-bg` layer behind glass surfaces. Never appears on UI, text, or borders.

### Neutral
- **Canvas Base** (`oklch(0.16 0.02 250)`): the true page backdrop in the dark theme — `--background` itself is transparent so the fixed aurora layer shows through everywhere that isn't a glass card.
- **Foreground** (`oklch(0.945 0.005 210)`): primary text color against the dark canvas.
- **Card Glass** (`oklch(0.32 0.02 225 / 55%)`): translucent card/container surface, paired with `backdrop-blur-xl` so the aurora blurs through it.
- **Popover** (`oklch(0.228 0.013 225)`): opaque surface for popovers/menus, where blur-through would hurt legibility.
- **Surface Secondary** (`oklch(0.285 0.014 222)`): the neutral fill for secondary buttons and secondary surfaces — a tone, not an accent.
- **Muted** (`oklch(0.275 0.013 222)`) / **Muted Foreground** (`oklch(0.705 0.012 215)`): de-emphasized text (section labels, timestamps, helper text) and quiet fills (empty heatmap cells).
- **Border** (`oklch(0.98 0.01 210 / 11%)`) / **Input Border** (`oklch(0.98 0.01 210 / 16%)`): hairline separators and field outlines, kept faint against the dark canvas.
- **Destructive** (`oklch(0.665 0.16 25)`): errors and destructive actions; also tints the heatmap's "missed" cell at low opacity (`destructive/20`) — a quiet gap, not an alarm.

### Named Rules
**The One Signal Rule.** Warm Gold marks exactly one thing: a goal completed today. It is never reused for hover states, alerts, badges, or emphasis — its rarity is what makes it legible as a signal.

**The Category-Color Monopoly Rule.** Outside of Deep Petrol Ink (structural accent) and Warm Gold (completion signal), the only color a user sees is the category color they themselves chose per goal. The rest of the UI stays neutral so that color reads as real information.

## Typography

**Display/Heading Font:** Newsreader (with ui-serif, Georgia, serif fallback)
**Body Font:** Hanken Grotesk (with ui-sans-serif, system-ui, sans-serif fallback)
**Mono Font:** IBM Plex Mono (with ui-monospace, monospace fallback)

**Character:** A low-contrast reading serif for structure paired with a quiet humanist sans for interface text and a monospace for every figure — the pairing reads as "ledger," not "app."

### Hierarchy
- **Display** (400, 2.25rem / `text-4xl`, tight leading): the single largest heading on a page — today's date on the dashboard.
- **Headline** (400, 1.875rem / `text-3xl`, tight leading): page-level `h1` elsewhere (goal detail, stats, settings).
- **Title** (500, 1rem / `text-base`, snug leading): card titles (`CardTitle`) and the nav wordmark ("Ritual").
- **Body** (400, 0.875rem / `text-sm`): default interface text — buttons, inputs, descriptions.
- **Label** (500, 0.875rem / `text-sm`, muted-foreground color): section eyebrows above content groups ("Ziele", "Letzte 12 Monate", "Meilensteine") — not uppercase, distinguished by color and weight alone.
- **Mono** (400–500, sizes range `text-[10px]`–`text-3xl` depending on context, `tabular-nums`): every number the app shows — dates, streak counts, percentages, quantity inputs and their units — so figures align and read as data.

### Named Rules
**The Numbers-Are-Mono Rule.** Any character that is a digit representing measured data (a date, a streak, a percentage, a quantity) renders in IBM Plex Mono with `tabular-nums`. Prose never borrows the mono face, and numbers never borrow the sans or serif face.

## Layout

Single-column, content-width containers (no dashboard-grid chrome); density stays low with generous vertical rhythm between labeled sections (`h2` label → content block). Desktop/tablet (`sm:` and up) gets a persistent top nav with full text labels and utility actions on the right; phone width collapses to a compact top bar (wordmark + logout only) plus a fixed bottom icon tab bar for the five primary destinations, with "Neues Ziel" always rendered in Deep Petrol Ink since it's an action, not a destination. Bottom padding (`pb-16`) on phone clears the fixed tab bar; `/login` and `/register` render neither nav.

## Elevation & Depth

Two distinct elevation systems by theme, both intentional. The shipped dark theme is a **hybrid**: `--background` is transparent so a fixed, slowly drifting three-blob aurora field (screen-blended, blurred 110px) is the true backdrop, and cards are translucent glass (`bg-card` + `backdrop-blur-xl`) that blur that field further rather than sitting on solid ground. The dormant light theme is **flat-by-default**: cards use a 1px `ring-foreground/10` instead of a shadow, and the canvas is a solid near-white. Neither theme uses conventional drop shadows for hierarchy; the one shadow-like effect in the system is a `box-shadow` glow reserved for hover on primary buttons and for the Warm Gold completion state — a glow, not a shadow, and always tied to an accent or state, never structural depth.

### Named Rules
**The Flat-By-Default Rule.** Structural hierarchy comes from surface color and translucency, not shadows. The only `box-shadow` usage in the system is an accent-colored glow on hover/success states.

## Shapes

Rounded, low-key geometry throughout via a single `--radius` primitive (0.625rem) scaled into six steps (`sm` 0.375rem through `4xl` 1.625rem) — no sharp corners anywhere in the UI. Interactive controls (buttons, inputs, checkboxes) sit at `sm`–`lg`; cards and larger containers at `xl`; badges and the checked checkbox go fully round (`4xl`/`rounded-full`). Category-color accents appear as a 4px left border on `GoalCard`, not a filled block — color as a thin marker, not a shape.

## Components

Buttons, inputs, cards, and badges share one restrained, precise voice: small fixed heights (`h-8` default), tight gaps, no ornamental borders, and state changes limited to background/ring shifts — nothing moves except the one deliberate `goal-complete-pop` animation on completion.

### Buttons
- **Shape:** `rounded-lg` (0.625rem); `xs`/`sm`/`icon-xs`/`icon-sm` sizes tighten the radius further (`min(--radius-md, 10–12px)`).
- **Primary:** Deep Petrol Ink background, its foreground text; hover adds a soft petrol glow (`box-shadow: 0 0 20px -2px var(--color-primary)`) alongside an opacity darken — the system's only structural button-hover glow.
- **Outline / Ghost / Secondary:** transparent or Surface Secondary background, no border color shift on hover — just a muted fill.
- **Destructive:** low-opacity destructive fill, not a solid red button — consistent with keeping saturated color rare.
- **Link:** underline-on-hover only, primary-colored text, no background.

### Cards / Containers
- **Corner style:** `rounded-xl` (0.875rem).
- **Background:** Card Glass (translucent + blur) in dark; solid `--card` in the dormant light theme.
- **Elevation:** see Elevation & Depth — `ring-foreground/10`, never a shadow.
- **Internal padding:** `--card-spacing` token, `1rem` default / `0.75rem` at `size="sm"`.

### Inputs / Fields
- **Style:** transparent background, `border-input`, `rounded-lg`, `h-8`.
- **Focus:** `border-ring` + a 3px `ring-ring/50` halo — no color fill change.
- **Numeric inputs** (goal value entry): paired with the mono font and a unit label rendered in muted mono text alongside.

### Navigation
- **Desktop:** sticky top bar, translucent (`bg-card/60` + blur), text links with a 2px Deep-Petrol-Ink underline indicator on the active route; wordmark in Title typography.
- **Phone:** compact top bar (wordmark + logout) plus a separate fixed bottom tab bar (icons + 10px labels), active state colored Deep Petrol Ink, inactive muted.

### Signature Component: Completion Feedback
The one place the system spends motion and color budget. A boolean check or a quantitative value reaching its target triggers, together: the `goal-complete-pop` scale animation (1 → 1.18 → 1, 320ms), a Warm Gold fill/glow on the checkbox or ring, and a small `canvas-confetti` burst in Deep-Petrol-Ink and Warm-Gold at the control's screen position. `prefers-reduced-motion: reduce` disables the aurora background drift; the pop and confetti are short, state-driven, and not purely decorative motion, so they are not currently gated by the same media query — worth confirming intentional if revisited.

### Signature Component: Heatmap
A GitHub-contribution-style grid (`h-3 w-3` cells, `3px` radius, week columns) using the system's own accent hue instead of a traffic-light red/green: a successful day is Deep Petrol Ink, a missed day is a faint destructive tint (`destructive/20`), and an unfetched/future day is Muted. Auto-scrolls to today on mount so the most recent history is what a user sees first.

## Do's and Don'ts

### Do:
- **Do** treat Warm Gold as a single reserved signal for "completed today" — never reuse it for hover, emphasis, or decoration.
- **Do** keep Deep Petrol Ink as the only structural accent for actions, focus, and progress; let category colors (user-chosen, per goal) be the only other color on screen.
- **Do** render every measured number — dates, streaks, percentages, quantities — in the mono typeface with `tabular-nums`.
- **Do** use the aurora/glass treatment only for the dark theme; keep the light theme flat with ring borders, not shadows, if it's ever surfaced.
- **Do** author new colors in OKLCH to match the project's canonical token format; don't introduce hex as a second source of truth.

### Don't:
- **Don't** use red/green traffic-light coloring for success/failure states (heatmap, streaks) — success is Deep Petrol Ink, failure is a quiet low-opacity destructive tint, not an alarm.
- **Don't** add conventional drop shadows for card hierarchy — depth comes from translucency/blur (dark) or a thin ring (light), per the Flat-By-Default Rule.
- **Don't** assume the light theme is reachable in the running app — it's a maintained second theme in the same token set, not the shipped default; verify before designing "for light mode" as if a toggle exists.
- **Don't** add a second decorative accent hue beyond Deep Petrol Ink / Warm Gold / the background-only Aurora Violet without a stated reason — the palette's restraint is deliberate.

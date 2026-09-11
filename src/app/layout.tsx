import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { AuroraBackground } from "@/components/AuroraBackground";
import { NavBar } from "@/components/NavBar";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";
import "./globals.css";

// Body: a humanist grotesque — open apertures, quiet at small sizes.
const bodySans = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// Display: a low-contrast reading serif for headings and numbers.
const displaySerif = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

// Mono: reserved for dates and streak counts that need to align.
const codeMono = IBM_Plex_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Habit Tracker",
  description: "Track habits and goals.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodySans.variable} ${displaySerif.variable} ${codeMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuroraBackground />
        <SessionProviderWrapper>
          <NavBar />
          {/* Bottom padding clears the fixed mobile tab bar (see NavBar);
              harmless on /login and /register, which render neither. */}
          <div className="pb-16 sm:pb-0">{children}</div>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}

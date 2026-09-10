import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Newsreader } from "next/font/google";
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
      className={`${bodySans.variable} ${displaySerif.variable} ${codeMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProviderWrapper>
          <NavBar />
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}

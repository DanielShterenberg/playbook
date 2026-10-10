import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { TeamProvider } from "@/contexts/TeamContext";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// Redesign type system: Barlow for UI text, Barlow Condensed for headings,
// IBM Plex Mono for the wordmark. Exposed as CSS variables for Tailwind
// (font-sans / font-display / font-mono).
// adjustFontFallback is off so text these faces cannot draw (Hebrew team and
// play names) falls through to system-ui, not to a size-adjusted Arial.
const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body", adjustFontFallback: false });
// Not preloaded: nothing above the fold uses the display face yet.
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  adjustFontFallback: false,
  preload: false,
});
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-mono", adjustFontFallback: false });

export const metadata: Metadata = {
  title: "Playbook",
  description:
    "A web-based basketball playbook application for coaches to diagram plays, animate transitions, and share with their team.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint so a stored dark choice never flashes light */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${body.variable} ${display.variable} ${mono.variable} font-sans antialiased`}>
          <AuthProvider><TeamProvider>{children}</TeamProvider></AuthProvider>
        </body>
    </html>
  );
}

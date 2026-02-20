import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { TeamProvider } from "@/contexts/TeamContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Basketball Playbook",
  description:
    "A web-based basketball playbook application for coaches to diagram plays, animate transitions, and share with their team.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
          <AuthProvider><TeamProvider>{children}</TeamProvider></AuthProvider>
        </body>
    </html>
  );
}

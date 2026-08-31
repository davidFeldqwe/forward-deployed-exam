import type { ReactNode } from "react";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import { cn } from "@/lib/utils";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata = {
  title: "Airport Investment Intelligence Agent",
  description:
    "A capacity-pressure screen: ranked, explained, number-backed answers from public data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={cn("dark", inter.variable, ibmPlexMono.variable, "font-sans")}
    >
      <body>{children}</body>
    </html>
  );
}

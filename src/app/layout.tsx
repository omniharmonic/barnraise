import type { Metadata } from "next";
import { DM_Sans, Young_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/providers";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Barn Raise — Rotational Labor Coordination",
  description:
    "Coordinate collective work events within your community. Form pools, host barn raises, earn labor hours.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${youngSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

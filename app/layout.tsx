import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avalon Online — Game Pengkhianatan Raja Arthur",
  description:
    "Main The Resistance: Avalon online bareng teman — 5-10 pemain, langsung dari HP. Bahasa Indonesia.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#020617",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

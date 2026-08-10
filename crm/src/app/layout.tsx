import type { Metadata, Viewport } from "next";
import { Archivo_Black, Jost } from "next/font/google";
import "./globals.css";

// Matches the public website's typography so the brand reads consistently
// across both apps, even though the CRM's layout stays a distinct, denser tool.
const display = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const sans = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: { default: "Darshh Holiday — CRM", template: "%s | Darshh Holiday CRM" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-ink-50">{children}</body>
    </html>
  );
}

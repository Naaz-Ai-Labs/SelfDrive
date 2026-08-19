import type { Metadata, Viewport } from "next";
import { Archivo_Black, Jost } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { businessInfo } from "@/lib/settings";
import { getBranches } from "@/lib/data";

// Bauhaus typography: a heavy geometric grotesque for display (Archivo Black)
// paired with Jost — a revival of 1920s geometric sans faces from the same
// era and spirit as the Bauhaus itself — for body/UI copy.
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f7f2eb",
};

export async function generateMetadata(): Promise<Metadata> {
  const info = await businessInfo();
  const name = (info.name as string) ?? "Darshh Holiday";
  const tagline = (info.tagline as string) ?? "Ride More. Explore More.";
  const city = (info.city as string) ?? "Hassan";
  return {
    metadataBase: new URL("https://www.selfdrive.bike"),
    title: {
      default: `${name} — ${tagline}`,
      template: `%s | ${name}`,
    },
    description: `Self-drive bike, scooter & car rental in Hassan district, Karnataka. Fixed transparent pricing, well-maintained fleet, no bargaining. Book online in minutes.`,
    alternates: { canonical: "/" },
    keywords: [
      "self drive car rental Hassan",
      "bike rental Hassan",
      `car rental ${city}`,
      "scooter rental",
      "tempo traveller rental",
      "Sakleshpura bike rental",
      "Sakleshpura car rental",
      "Chikmagalur road trip car rental",
      name,
    ],
    openGraph: {
      title: `${name} — ${tagline}`,
      description: `Self-drive bike, scooter and car rentals in ${city}. Fixed transparent pricing, no bargaining.`,
      type: "website",
      locale: "en_IN",
      images: [{ url: "/logo.jpeg", width: 792, height: 685, alt: name }],
    },
    twitter: {
      card: "summary",
      title: `${name} — ${tagline}`,
      description: `Self-drive bike, scooter and car rentals in ${city}. Fixed transparent pricing, no bargaining.`,
      images: ["/logo.jpeg"],
    },
    // Geo meta tags for local search relevance (Sakleshpura, Karnataka HQ).
    // These are a minor, mostly-legacy signal — real local ranking comes from the
    // Google Business Profile and the LocalBusiness/AutoRental JSON-LD below, not
    // from these tags, but they cost nothing to include correctly.
    other: {
      "geo.region": "IN-KA",
      "geo.placename": "Sakleshpura, Karnataka",
      "geo.position": "12.9585;75.7859",
      ICBM: "12.9585, 75.7859",
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [info, branches] = await Promise.all([businessInfo(), getBranches()]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoRental",
    name: String(info.name ?? "Darshh Holiday"),
    description: "Self-drive bike, scooter and car rentals across Hassan district, Karnataka — fixed transparent pricing, no bargaining.",
    telephone: String(info.phone ?? ""),
    email: String(info.email ?? ""),
    priceRange: "₹₹",
    areaServed: ["Hassan", "Sakleshpura", "Chikmagalur"],
    geo: { "@type": "GeoCoordinates", latitude: 12.9585, longitude: 75.7859 },
    sameAs: [info.social && typeof info.social === "object" ? (info.social as Record<string, unknown>).instagram : undefined].filter(Boolean),
    location: branches
      .filter((b) => b.active)
      .map((b) => ({
        "@type": "Place",
        name: b.name,
        address: b.address
          ? { "@type": "PostalAddress", streetAddress: b.address, addressLocality: b.city ?? undefined, addressRegion: "Karnataka", addressCountry: "IN" }
          : undefined,
        telephone: b.phone ?? undefined,
      })),
  };

  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `window.addEventListener('unhandledrejection',function(e){if(e.reason&&(String(e.reason).includes('Could not establish connection')||String(e.reason).includes('Receiving end does not exist')||String(e.reason).includes('message channel closed'))){e.preventDefault();}});`,
          }}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Header info={info} />
        <main className="flex-1 pt-20 sm:pt-24">{children}</main>
        <Footer info={info} />
      </body>
    </html>
  );
}

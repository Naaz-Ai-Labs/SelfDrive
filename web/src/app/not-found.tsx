import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container-x flex min-h-[70vh] items-center justify-center py-24">
      <div className="card w-full max-w-lg p-8">
        <p className="stat-figure text-6xl font-display text-brand-500">404</p>
        <h1 className="mt-3 text-3xl font-display text-ink-950">Page not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">
          The page you&apos;re looking for doesn&apos;t exist or has moved. Check the address, or
          jump back to one of these.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="btn-primary">
            Back home
          </Link>
          <Link href="/vehicles" className="btn-secondary">
            Browse vehicles
          </Link>
          <Link href="/contact" className="btn-secondary">
            Contact us
          </Link>
        </div>
      </div>
    </main>
  );
}

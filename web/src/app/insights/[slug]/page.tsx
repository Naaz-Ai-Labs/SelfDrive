import type { Metadata } from "next";
import Link from "next/link";
import { getBlogPost } from "@/lib/data";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/utils";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getBlogPost(params.slug);
  if (!post) return {};
  return {
    title: String(post.title),
    description: String(post.excerpt ?? ""),
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getBlogPost(params.slug);
  if (!post) notFound();

  return (
    <article className="container-x max-w-3xl py-14">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-400">
        <ol className="flex gap-2">
          <li><Link href="/" className="hover:text-brand-700">Home</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/insights" className="hover:text-brand-700">Insights</Link></li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-ink-600">{String(post.title)}</li>
        </ol>
      </nav>
      <h1 className="mt-6 font-display text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">{String(post.title)}</h1>
      <p className="mt-3 text-sm text-ink-500">
        {formatDate(String(post.created_at ?? ""))} · {String(post.author ?? "")}
      </p>
      {post.excerpt ? <p className="mt-6 text-lg leading-relaxed text-ink-600">{String(post.excerpt)}</p> : null}
      <div className="mt-8 space-y-5 text-base leading-relaxed text-ink-700">
        {String(post.content)
          .split(/\n\n+/)
          .map((para, i) => (
            <p key={i}>{para}</p>
          ))}
      </div>
      <div className="mt-12 rounded-2xl bg-brand-500/10 p-6 text-center">
        <p className="font-display text-lg font-semibold text-ink-900">Planning a trip?</p>
        <p className="mt-1 text-sm text-ink-600">See fixed pricing and book your vehicle in minutes.</p>
        <Link href="/booking" className="btn-primary mt-4">Book now</Link>
      </div>
    </article>
  );
}

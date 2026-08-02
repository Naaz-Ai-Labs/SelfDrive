"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTestimonial, saveFaq, saveBlogPost, saveGalleryItem } from "@/lib/actions";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Blocked() {
  return <p className="text-sm text-ink-500">Managed by an administrator.</p>;
}

export function ContentEditors({
  testimonials, faqs, posts, gallery, isAdmin,
}: {
  testimonials: Array<Record<string, unknown>>;
  faqs: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
  gallery: Array<Record<string, unknown>>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [tForm, setTForm] = useState({ name: "", vehicle: "", location: "", rating: "5", quote: "" });
  const [fForm, setFForm] = useState({ question: "", answer: "" });
  const [bForm, setBForm] = useState({ title: "", excerpt: "", content: "" });
  const [gForm, setGForm] = useState({ title: "", image: "", category: "" });

  const run = (fn: () => Promise<unknown>, reset: () => void) => {
    setError("");
    startTransition(async () => {
      try {
        await fn();
        reset();
        router.refresh();
      } catch {
        setError("Could not save. Check your input and try again.");
      }
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Section title="Testimonials">
        {!isAdmin ? <Blocked /> : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (tForm.name.trim().length < 2 || tForm.quote.trim().length < 10) {
                setError("Name and a longer quote are required.");
                return;
              }
              run(() => saveTestimonial({ name: tForm.name.trim(), vehicle: tForm.vehicle || undefined, location: tForm.location || undefined, rating: Number(tForm.rating), quote: tForm.quote.trim() }), () => setTForm({ name: "", vehicle: "", location: "", rating: "5", quote: "" }));
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="input" placeholder="Name *" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} />
              <input className="input" placeholder="Vehicle" value={tForm.vehicle} onChange={(e) => setTForm({ ...tForm, vehicle: e.target.value })} />
              <input className="input" placeholder="Location" value={tForm.location} onChange={(e) => setTForm({ ...tForm, location: e.target.value })} />
            </div>
            <textarea className="input min-h-20" placeholder="Quote *" value={tForm.quote} onChange={(e) => setTForm({ ...tForm, quote: e.target.value })} />
            <div className="flex items-center gap-3">
              <select className="input w-24" value={tForm.rating} onChange={(e) => setTForm({ ...tForm, rating: e.target.value })}>
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}
              </select>
              <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs">Add testimonial</button>
            </div>
          </form>
        )}
        <ul className="mt-4 space-y-2">
          {testimonials.map((t) => (
            <li key={Number(t.id)} className="rounded-xl border border-ink-100 p-3 text-sm">
              <span className="font-semibold text-ink-900">{String(t.name)}</span> <span className="text-amber-500">{"★".repeat(Number(t.rating) || 0)}</span> — {String(t.quote).slice(0, 120)}…
            </li>
          ))}
        </ul>
      </Section>

      <Section title="FAQs">
        {!isAdmin ? <Blocked /> : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (fForm.question.trim().length < 5 || fForm.answer.trim().length < 10) {
                setError("Question and a complete answer are required.");
                return;
              }
              run(() => saveFaq({ question: fForm.question.trim(), answer: fForm.answer.trim() }), () => setFForm({ question: "", answer: "" }));
            }}
          >
            <input className="input" placeholder="Question *" value={fForm.question} onChange={(e) => setFForm({ ...fForm, question: e.target.value })} />
            <textarea className="input min-h-16" placeholder="Answer *" value={fForm.answer} onChange={(e) => setFForm({ ...fForm, answer: e.target.value })} />
            <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs">Add FAQ</button>
          </form>
        )}
        <ul className="mt-4 space-y-2">
          {faqs.map((f) => (
            <li key={Number(f.id)} className="rounded-xl border border-ink-100 p-3 text-sm">
              <span className="font-semibold text-ink-900">{String(f.question)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Gallery">
        {!isAdmin ? <Blocked /> : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^https?:\/\//.test(gForm.image.trim())) {
                setError("Enter a valid image URL (https://…).");
                return;
              }
              run(() => saveGalleryItem({ title: gForm.title || undefined, image: gForm.image.trim(), category: gForm.category || undefined }), () => setGForm({ title: "", image: "", category: "" }));
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="input" placeholder="Title" value={gForm.title} onChange={(e) => setGForm({ ...gForm, title: e.target.value })} />
              <input className="input sm:col-span-1" placeholder="Image URL *" value={gForm.image} onChange={(e) => setGForm({ ...gForm, image: e.target.value })} />
              <input className="input" placeholder="Category" value={gForm.category} onChange={(e) => setGForm({ ...gForm, category: e.target.value })} />
            </div>
            <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs">Add image</button>
          </form>
        )}
      </Section>

      <Section title="Blog / Insights">
        {!isAdmin ? <Blocked /> : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (bForm.title.trim().length < 5 || bForm.content.trim().length < 50) {
                setError("A title and article content (at least a few sentences) are required.");
                return;
              }
              run(() => saveBlogPost({ title: bForm.title.trim(), excerpt: bForm.excerpt || undefined, content: bForm.content.trim() }), () => setBForm({ title: "", excerpt: "", content: "" }));
            }}
          >
            <input className="input" placeholder="Title *" value={bForm.title} onChange={(e) => setBForm({ ...bForm, title: e.target.value })} />
            <input className="input" placeholder="Excerpt" value={bForm.excerpt} onChange={(e) => setBForm({ ...bForm, excerpt: e.target.value })} />
            <textarea className="input min-h-32" placeholder="Content * (blank line between paragraphs)" value={bForm.content} onChange={(e) => setBForm({ ...bForm, content: e.target.value })} />
            <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs">Publish article</button>
          </form>
        )}
        <ul className="mt-4 space-y-2">
          {posts.map((p) => (
            <li key={Number(p.id)} className="rounded-xl border border-ink-100 p-3 text-sm">
              <span className="font-semibold text-ink-900">{String(p.title)}</span> {p.published !== 1 && <span className="badge bg-stone-100 text-stone-500">draft</span>}
            </li>
          ))}
        </ul>
      </Section>

      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

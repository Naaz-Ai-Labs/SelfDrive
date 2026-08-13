"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Stars } from "@/components/ui";

type Story = {
  id: string;
  category: "all" | "trails" | "heritage" | "getaways" | "group";
  title: string;
  rider: string;
  location: string;
  vehicle: string;
  vehicleSlug: string;
  image: string;
  quote: string;
  duration: string;
  tag: string;
  rating: number;
  storySnippet: string;
};

const STORIES: Story[] = [
  {
    id: "bisle-ghat-thar",
    category: "trails",
    title: "Monsoon Expedition through Bisle Ghats",
    rider: "Ananya & Group",
    location: "Sakleshpura ➔ Bisle Viewpoint",
    vehicle: "Mahindra Thar 4x4",
    vehicleSlug: "mahindra-thar",
    image: "/vehicles/mahindra-thar.avif",
    quote: "The Thar handled the rain-slicked curves and muddy estate trails effortlessly. Upfront pricing made the entire booking seamless!",
    duration: "3 Days",
    tag: "4x4 Expedition",
    rating: 5,
    storySnippet: "Drove through heavy mist and lush coffee plantations up to Bisle Ghat. The 4x4 capability gave total confidence on mountain hairpin bends.",
  },
  {
    id: "chikmagalur-enfield",
    category: "trails",
    title: "Mullayanagiri Peak & Coffee Estate Trail",
    rider: "Vikram & Friends",
    location: "Sakleshpura ➔ Baba Budangiri ➔ Mullayanagiri",
    vehicle: "Royal Enfield Classic 350",
    vehicleSlug: "honda-shine",
    image: "/vehicles/tvs-ronin.avif",
    quote: "Cruising through the coffee aroma with the thumping engine in the hills. The bike was freshly serviced and ran flawlessly.",
    duration: "2 Days",
    tag: "Mountain Trail",
    rating: 5,
    storySnippet: "Rode up to Karnataka's highest peak at sunrise. The cool breeze, panoramic valley views, and smooth throttle response made it unforgettable.",
  },
  {
    id: "belur-halebidu-heritage",
    category: "heritage",
    title: "Hoysala Temple & Cultural Heritage Circuit",
    rider: "Suresh Gowda & Family",
    location: "Hassan ➔ Belur ➔ Halebidu ➔ Sakleshpura",
    vehicle: "Maruti Ertiga 7-Seater",
    vehicleSlug: "maruti-ertiga-7-seater",
    image: "/vehicles/maruti-ertiga.avif",
    quote: "Spacious 7-seater for our 3-generation family trip. Transparent fixed pricing meant no bargaining or stress at handover.",
    duration: "2 Days",
    tag: "Family Heritage",
    rating: 5,
    storySnippet: "Explored 12th-century Hoysala architecture in Belur and Halebidu. The car was clean, cool, and comfortable for grandparents and kids alike.",
  },
  {
    id: "manjarabad-fort-getaway",
    category: "getaways",
    title: "Star Fort Escape to Manjarabad",
    rider: "Priya & Friends",
    location: "Sakleshpura Town ➔ Manjarabad Star Fort",
    vehicle: "Honda Activa & TVS NTorq",
    vehicleSlug: "honda-shine",
    image: "/vehicles/category-scooters.jpg",
    quote: "Zipping through narrow village lanes on scooters was pure fun! Easy to park, super fuel efficient, and zero hassle.",
    duration: "1 Day",
    tag: "Weekend Getaway",
    rating: 5,
    storySnippet: "Climbed the steps of the star-shaped fort built by Tipu Sultan. Panoramic views of Western Ghats in every direction.",
  },
  {
    id: "tempo-group-sightseeing",
    category: "group",
    title: "Full Day Sakleshpura Group Sightseeing",
    rider: "Corporate Team Outing",
    location: "Sakleshpura Sightseeing Circuit",
    vehicle: "Tempo Traveller (12-Seater)",
    vehicleSlug: "tempo-traveller-sakleshpura-sightseeing",
    image: "/vehicles/tempo-traveller.jpg",
    quote: "Chauffeur-driven package with fuel included. Our team could relax, play music, and enjoy waterfalls without driving stress.",
    duration: "Full Day",
    tag: "Group Package",
    rating: 5,
    storySnippet: "Visited Hadlu Waterfalls, Hemavathi backwaters, and coffee processing units in one seamless day out.",
  },
];

const CATEGORIES = [
  { id: "all", label: "All Stories" },
  { id: "trails", label: "Mountain Trails" },
  { id: "heritage", label: "Cultural Heritage" },
  { id: "getaways", label: "Weekend Getaways" },
  { id: "group", label: "Group Trips" },
];

const PILLARS = [
  {
    title: "Fixed Pricing, Always",
    desc: "The rate on our screen is the rate you pay. Zero bargaining, zero hidden fees at counter pickup.",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Inspected Handover",
    desc: "Tyres, brakes, fluid levels and hygiene are checked before handing over every key.",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Local Mountain Expertise",
    desc: "Based in Hassan & Sakleshpura, our local team knows every trail, weather shift, and route condition.",
    icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z",
  },
  {
    title: "24×7 Road Assistance",
    desc: "Single point of contact from booking to vehicle return — real human help whenever needed.",
    icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

export function OurStories({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const isLight = variant === "light";

  const filtered = activeTab === "all" ? STORIES : STORIES.filter((s) => s.category === activeTab);

  return (
    <section className={isLight ? "bg-ink-50 text-ink-950 py-16 sm:py-24 relative overflow-hidden" : "bg-ink-950 text-white py-16 sm:py-24 grain relative overflow-hidden"}>
      <div className="container-x relative z-10 space-y-16 sm:space-y-20">
        
        {/* 1. About Us Overview Header */}
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7 space-y-6">
            <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.28em] ${
              isLight ? "border-brand-500/40 bg-brand-50 text-brand-700" : "border-brand-400/30 bg-brand-500/10 text-brand-300"
            }`}>
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
              About Us &amp; Our Story
            </span>
            <h2 className={`font-display text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight ${isLight ? "text-ink-950" : "text-white"}`}>
              Driven by Trust. <br className="hidden sm:block" />
              <span className={isLight ? "text-brand-600" : "text-brand-400"}>Ridden with Freedom.</span>
            </h2>
            <p className={`text-base sm:text-lg leading-relaxed max-w-2xl ${isLight ? "text-ink-700" : "text-white/80"}`}>
              Darshh Holiday (Darshan Tours) is Hassan district&apos;s dedicated self-drive vehicle operator. 
              We started with a simple belief: exploring Sakleshpura, Chikmagalur, and the Western Ghats 
              should begin with transparent numbers, not stressful counter negotiations.
            </p>
            <p className={`text-sm sm:text-base leading-relaxed max-w-2xl ${isLight ? "text-ink-600" : "text-white/70"}`}>
              Whether you need a daily commuter scooter, a classic Royal Enfield for mountain curves, 
              a 4x4 Thar for off-road trails, or a 12-seater Tempo Traveller for family getaways — we deliver 
              well-maintained rides with straightforward terms.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <Link href="/vehicles" className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-7 py-3.5 text-sm font-bold text-ink-950 shadow-lift transition hover:bg-brand-400">
                Explore Fleet
              </Link>
              <Link href="/about" className={`inline-flex items-center justify-center gap-2 rounded-full border px-7 py-3.5 text-sm font-semibold transition ${
                isLight ? "border-ink-200 bg-white text-ink-900 shadow-sm hover:bg-ink-100" : "border-white/20 bg-white/5 text-white backdrop-blur hover:bg-white/10"
              }`}>
                Learn More About Us
              </Link>
            </div>
          </div>

          {/* About Us Key Stats Grid */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            <div className={`rounded-3xl border p-6 text-center transition ${
              isLight ? "border-ink-200/80 bg-white shadow-sm hover:border-brand-500/40" : "border-white/10 bg-white/[0.05] backdrop-blur-xl hover:border-brand-400/40"
            }`}>
              <p className={`font-display text-3xl sm:text-4xl font-black ${isLight ? "text-brand-600" : "text-brand-400"}`}>1,200+</p>
              <p className={`mt-1 text-xs font-semibold uppercase tracking-wider ${isLight ? "text-ink-600" : "text-white/70"}`}>Trips Handed Over</p>
            </div>
            <div className={`rounded-3xl border p-6 text-center transition ${
              isLight ? "border-ink-200/80 bg-white shadow-sm hover:border-brand-500/40" : "border-white/10 bg-white/[0.05] backdrop-blur-xl hover:border-brand-400/40"
            }`}>
              <p className={`font-display text-3xl sm:text-4xl font-black ${isLight ? "text-brand-600" : "text-brand-400"}`}>4.9 ★</p>
              <p className={`mt-1 text-xs font-semibold uppercase tracking-wider ${isLight ? "text-ink-600" : "text-white/70"}`}>Rider Rating</p>
            </div>
            <div className={`rounded-3xl border p-6 text-center transition ${
              isLight ? "border-ink-200/80 bg-white shadow-sm hover:border-brand-500/40" : "border-white/10 bg-white/[0.05] backdrop-blur-xl hover:border-brand-400/40"
            }`}>
              <p className={`font-display text-3xl sm:text-4xl font-black ${isLight ? "text-brand-600" : "text-brand-400"}`}>20+</p>
              <p className={`mt-1 text-xs font-semibold uppercase tracking-wider ${isLight ? "text-ink-600" : "text-white/70"}`}>Verified Fleet</p>
            </div>
            <div className={`rounded-3xl border p-6 text-center transition ${
              isLight ? "border-ink-200/80 bg-white shadow-sm hover:border-brand-500/40" : "border-white/10 bg-white/[0.05] backdrop-blur-xl hover:border-brand-400/40"
            }`}>
              <p className={`font-display text-3xl sm:text-4xl font-black ${isLight ? "text-brand-600" : "text-brand-400"}`}>100%</p>
              <p className={`mt-1 text-xs font-semibold uppercase tracking-wider ${isLight ? "text-ink-600" : "text-white/70"}`}>Fixed Pricing</p>
            </div>
          </div>
        </div>

        {/* 2. Core Service Pillars */}
        <div className={`border-t border-b py-12 ${isLight ? "border-ink-200/80" : "border-white/10"}`}>
          <div className="text-center max-w-xl mx-auto mb-10">
            <span className={`text-xs font-bold uppercase tracking-[0.24em] ${isLight ? "text-brand-700" : "text-brand-400"}`}>Why Travelers Trust Us</span>
            <h3 className={`mt-2 font-display text-2xl sm:text-3xl font-bold ${isLight ? "text-ink-950" : "text-white"}`}>The Pillars of Our Service</h3>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <div key={p.title} className={`rounded-2xl border p-6 transition ${
                isLight ? "border-ink-200/80 bg-white shadow-sm hover:border-brand-500/40 hover:shadow-md" : "border-white/10 bg-white/[0.03] hover:border-brand-400/40 hover:bg-white/[0.06]"
              }`}>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl mb-4 ${
                  isLight ? "bg-brand-500/15 text-brand-700" : "bg-brand-500/15 text-brand-400"
                }`} aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={p.icon} />
                  </svg>
                </div>
                <h4 className={`font-display text-base font-bold ${isLight ? "text-ink-950" : "text-white"}`}>{p.title}</h4>
                <p className={`mt-2 text-xs sm:text-sm leading-relaxed ${isLight ? "text-ink-600" : "text-white/70"}`}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Rider Stories & Experiences */}
        <div>
          <div className={`flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b ${isLight ? "border-ink-200/80" : "border-white/10"}`}>
            <div>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-bold uppercase tracking-wider ${
                isLight ? "border-brand-500/30 bg-brand-50 text-brand-700" : "border-brand-400/30 bg-brand-500/10 text-brand-300"
              }`}>
                Road Trip Chronicles
              </span>
              <h3 className={`mt-3 font-display text-2xl sm:text-3xl lg:text-4xl font-black ${isLight ? "text-ink-950" : "text-white"}`}>
                Stories from Our Riders
              </h3>
              <p className={`mt-2 max-w-xl text-sm sm:text-base ${isLight ? "text-ink-600" : "text-white/75"}`}>
                Real journeys, mountain trails, and heritage circuits experienced by travellers riding with Darshh Holiday.
              </p>
            </div>

            {/* Filter Category Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${
                    activeTab === cat.id
                      ? "bg-brand-500 text-ink-950 shadow-lift"
                      : isLight
                        ? "bg-white border border-ink-200 text-ink-700 hover:bg-ink-100 hover:text-ink-950 shadow-sm"
                        : "bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stories Grid */}
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((story) => (
              <article
                key={story.id}
                onClick={() => setSelectedStory(story)}
                className={`group cursor-pointer relative flex flex-col overflow-hidden rounded-3xl border transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${
                  isLight
                    ? "border-ink-200/80 bg-white shadow-sm hover:border-brand-500/40"
                    : "border-white/10 bg-white/[0.04] hover:border-brand-400/50 hover:bg-white/[0.08]"
                }`}
              >
                <div className="relative h-56 w-full overflow-hidden bg-ink-900">
                  <Image
                    src={story.image}
                    alt={story.title}
                    fill
                    loading="lazy"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" aria-hidden />
                  <span className="absolute top-4 left-4 rounded-full bg-brand-500/90 px-3 py-1 text-[11px] font-bold text-ink-950 backdrop-blur-md">
                    {story.tag}
                  </span>
                  <span className="absolute bottom-4 left-4 text-xs font-medium text-white/90">
                    📍 {story.location}
                  </span>
                </div>

                <div className="flex flex-1 flex-col justify-between p-6">
                  <div>
                    <div className={`flex items-center justify-between text-xs mb-2 ${isLight ? "text-ink-500" : "text-white/60"}`}>
                      <span>{story.duration}</span>
                      <Stars rating={story.rating} />
                    </div>
                    <h4 className={`font-display text-lg font-bold transition-colors ${
                      isLight ? "text-ink-950 group-hover:text-brand-600" : "text-white group-hover:text-brand-300"
                    }`}>
                      {story.title}
                    </h4>
                    <p className={`mt-3 text-xs sm:text-sm leading-relaxed line-clamp-3 ${isLight ? "text-ink-700" : "text-white/80"}`}>
                      &ldquo;{story.quote}&rdquo;
                    </p>
                  </div>

                  <div className={`mt-6 flex items-center justify-between border-t pt-4 ${isLight ? "border-ink-100" : "border-white/10"}`}>
                    <div>
                      <p className={`text-xs font-bold ${isLight ? "text-brand-700" : "text-brand-400"}`}>{story.rider}</p>
                      <p className={`text-[11px] ${isLight ? "text-ink-500" : "text-white/60"}`}>{story.vehicle}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold group-hover:translate-x-1 transition-transform ${
                      isLight ? "text-brand-700" : "text-brand-300"
                    }`}>
                      Read story →
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

      </div>

      {/* Story Detail Modal */}
      {selectedStory && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md ${isLight ? "bg-ink-950/40" : "bg-ink-950/80"}`} onClick={() => setSelectedStory(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative max-w-2xl w-full rounded-3xl border p-6 sm:p-8 shadow-2xl overflow-hidden ${
              isLight ? "bg-white border-ink-200 text-ink-950" : "bg-ink-950 border-white/15 text-white"
            }`}
          >
            <button
              onClick={() => setSelectedStory(null)}
              aria-label="Close story detail"
              className={`absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full transition ${
                isLight ? "bg-ink-100 text-ink-700 hover:bg-ink-200" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              ✕
            </button>
            <div className="relative h-56 -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 mb-6 overflow-hidden">
              <Image src={selectedStory.image} alt={selectedStory.title} fill className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
              <div className="absolute bottom-4 left-6 sm:left-8">
                <span className="rounded-full bg-brand-500 px-3.5 py-1 text-xs font-bold text-ink-950">
                  {selectedStory.tag}
                </span>
                <h3 className="mt-2 font-display text-2xl font-black text-white">{selectedStory.title}</h3>
              </div>
            </div>
            <div className="space-y-4">
              <div className={`flex flex-wrap gap-4 text-xs ${isLight ? "text-ink-600" : "text-white/70"}`}>
                <span>📍 {selectedStory.location}</span>
                <span>⏱ {selectedStory.duration}</span>
                <span>🚘 {selectedStory.vehicle}</span>
              </div>
              <p className={`text-base leading-relaxed italic ${isLight ? "text-ink-800" : "text-white/90"}`}>
                &ldquo;{selectedStory.quote}&rdquo;
              </p>
              <p className={`text-sm leading-relaxed ${isLight ? "text-ink-600" : "text-white/70"}`}>
                {selectedStory.storySnippet}
              </p>
              <div className={`pt-4 flex justify-between items-center border-t ${isLight ? "border-ink-100" : "border-white/10"}`}>
                <p className={`text-xs ${isLight ? "text-ink-500" : "text-white/60"}`}>Rider: <strong className={isLight ? "text-brand-700" : "text-brand-400"}>{selectedStory.rider}</strong></p>
                <Link
                  href={`/vehicles/${selectedStory.vehicleSlug}`}
                  className="inline-flex items-center justify-center rounded-full bg-brand-500 px-5 py-2 text-xs font-bold text-ink-950 transition hover:bg-brand-400"
                >
                  Book this vehicle
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

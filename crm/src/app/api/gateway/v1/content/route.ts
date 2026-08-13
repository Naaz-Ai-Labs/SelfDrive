import { NextRequest, NextResponse } from "next/server";
import { requireGatewayKey } from "@/lib/gateway-auth";
import {
  getVehicleCategories, getVehicles, getTestimonials, getGallery, getFaqs,
  getStaff, getActiveTermsVersion, getBlogPosts, getBlogPost, getBranches,
} from "@/lib/data";
import { businessInfo, rentalRules } from "@/lib/settings";

/** One combined read model for everything the public site's static/semi-static pages
 * need (fleet, categories, testimonials, gallery, faqs, staff, terms, business info) —
 * this is small, cheap-to-read data, so serving it as one payload keeps the gateway
 * surface small instead of one endpoint per page. */
export async function GET(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;

  // These are all async reads now. Handing the unawaited promises to
  // NextResponse.json serialises every one of them as `{}`.
  const [
    business, rules, categories, vehicles, branches,
    testimonials, gallery, faqs, staff, terms, blogPosts,
  ] = await Promise.all([
    businessInfo(),
    rentalRules(),
    getVehicleCategories(),
    getVehicles({ onlyAvailable: true }),
    getBranches(),
    getTestimonials(),
    getGallery(),
    getFaqs(),
    getStaff(),
    getActiveTermsVersion(),
    getBlogPosts(),
  ]);

  return NextResponse.json({
    business,
    rentalRules: rules,
    categories,
    vehicles,
    branches,
    testimonials,
    gallery,
    faqs,
    staff,
    terms,
    blogPosts,
  });
}

export async function POST(req: NextRequest) {
  const denied = requireGatewayKey(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (body?.op === "blogPost" && typeof body.slug === "string") {
    const post = getBlogPost(body.slug);
    return NextResponse.json({ post });
  }
  return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
}

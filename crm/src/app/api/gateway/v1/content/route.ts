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

  return NextResponse.json({
    business: businessInfo(),
    rentalRules: rentalRules(),
    categories: getVehicleCategories(),
    vehicles: getVehicles({ onlyAvailable: true }),
    branches: getBranches(),
    testimonials: getTestimonials(),
    gallery: getGallery(),
    faqs: getFaqs(),
    staff: getStaff(),
    terms: getActiveTermsVersion(),
    blogPosts: getBlogPosts(),
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

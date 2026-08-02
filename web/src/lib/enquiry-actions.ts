"use server";

import { gatewayPost } from "./gateway";

export async function submitEnquiry(input: { name: string; phone: string; email?: string; source?: string; notes: string }) {
  return gatewayPost<{ ok: boolean; enquiryNo?: string; error?: string }>("/api/gateway/v1/enquiries", input);
}

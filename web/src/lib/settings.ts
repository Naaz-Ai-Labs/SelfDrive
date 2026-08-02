import { getContent } from "./data";

export async function businessInfo(): Promise<Record<string, unknown>> {
  return (await getContent()).business;
}

export async function rentalRules(): Promise<Record<string, unknown>> {
  return (await getContent()).rentalRules;
}

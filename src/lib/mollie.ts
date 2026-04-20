import createMollieClient, { type MollieClient } from "@mollie/api-client";

let cached: MollieClient | null = null;

export function getMollieClient(): MollieClient | null {
  if (cached) return cached;
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return null;
  cached = createMollieClient({ apiKey });
  return cached;
}

export function isMollieConfigured(): boolean {
  return Boolean(process.env.MOLLIE_API_KEY);
}

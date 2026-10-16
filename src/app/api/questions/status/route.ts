import { providerConfiguration } from "@/lib/ai/provider";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Configuration is observable; provider health is not inferred from a credential. */
export function GET(): Response {
  const configuration = providerConfiguration();
  return Response.json({
    preparedAvailable: true,
    liveConfigured: configuration.configured,
    liveStatus: "unverified",
    provider: configuration.provider,
  }, { headers: { "Cache-Control": "no-store" } });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Configuration is observable; provider health is not inferred from a credential. */
export function GET(): Response {
  return Response.json({
    preparedAvailable: true,
    liveConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    liveStatus: "unverified",
  }, { headers: { "Cache-Control": "no-store" } });
}

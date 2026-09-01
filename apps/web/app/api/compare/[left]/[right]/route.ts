import { rankQueryResponse } from "@/app/rank-http";

/**
 * Two IATAs, as two rows. Naming the codes lifts the default limit so both
 * come back; the screen never merges a city market.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ left: string; right: string }> },
): Promise<Response> {
  const { left, right } = await context.params;
  return rankQueryResponse(request.url, { iata: [left, right] });
}

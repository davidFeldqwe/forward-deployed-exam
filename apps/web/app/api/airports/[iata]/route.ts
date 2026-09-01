import { rankQueryResponse } from "@/app/rank-http";

/**
 * One airport by IATA. The path code is the filter; other query-string args
 * still reach `queryAirports` the same way the rank route's do.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ iata: string }> },
): Promise<Response> {
  const { iata } = await context.params;
  return rankQueryResponse(request.url, { iata });
}

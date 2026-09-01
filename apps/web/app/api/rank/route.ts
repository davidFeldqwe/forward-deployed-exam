import { rankQueryResponse } from "@/app/rank-http";

/**
 * National (or filtered) ranking. No session, no model: the body is
 * `queryAirports` over the committed snapshot.
 */
export function GET(request: Request): Response {
  return rankQueryResponse(request.url);
}

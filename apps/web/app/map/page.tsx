import { scoreUniverse } from "@repo/scoring";
import { loadSnapshot } from "@repo/snapshot";

import { currentSession } from "@/app/auth-session";
import { mapMarks } from "@/app/map-view";
import { mapCopy } from "@/app/map-copy";
import { Skyline } from "@/components/Skyline";

export const metadata = {
  title: mapCopy.title,
  description: mapCopy.intro,
};

/**
 * The public capacity-pressure skyline (issue #69). No gate: the session is
 * read only so the bar can offer Sign out to someone who arrived signed in.
 * The numbers are `scoreUniverse` over the committed snapshot — no aviation
 * HTTP, and no LLM key.
 */
export default async function MapPage() {
  const session = await currentSession();

  return <Skyline signedIn={session !== null} marks={mapMarks(scoreUniverse(loadSnapshot()))} />;
}

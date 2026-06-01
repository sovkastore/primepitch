import { getAllMatches, getMatchStatus } from "@/lib/api";
import Hero from "@/components/Hero";
import LiveNow from "@/components/LiveNow";
import Upcoming from "@/components/Upcoming";
import BrowseSports from "@/components/BrowseSports";

export const revalidate = 30;

export default async function HomePage() {
  const matches = await getAllMatches();

  const footballLive = matches.find(
    (m) => m.category === "football" && getMatchStatus(m) === "live"
  );
  const anyLive = matches.find((m) => getMatchStatus(m) === "live");
  const firstUpcoming = matches
    .filter((m) => getMatchStatus(m) === "upcoming")
    .sort((a, b) => a.date - b.date)[0];

  const heroMatch = footballLive || anyLive || firstUpcoming || null;

  return (
    <>
      <Hero match={heroMatch} />
      <LiveNow matches={matches} />
      <Upcoming matches={matches} />
      <BrowseSports />
    </>
  );
}

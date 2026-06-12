"use client";

// Plain-language documentation of the admin dashboard for new admins.
// Static content — explains what every section and value means.

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
      <p className="text-[12px] text-gray-500 mt-0.5 mb-4">{subtitle}</p>
      <dl className="space-y-3">{children}</dl>
    </div>
  );
}

function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[160px_1fr] gap-1 sm:gap-3">
      <dt className="text-[13px] font-bold text-gray-800">{name}</dt>
      <dd className="text-[13px] text-gray-600 leading-relaxed">{children}</dd>
    </div>
  );
}

export default function AdminGuidePage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Admin Guide</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          What every page and number in this dashboard means. Read this first if you&apos;re new.
        </p>
      </div>

      {/* Key concepts */}
      <Section title="Key concepts" subtitle="The words used everywhere in this dashboard.">
        <Term name="Visitor">Anyone who opens the site. Identified by a random ID saved in their browser — so the same person on a different browser or phone, or after clearing their data, counts as a new visitor.</Term>
        <Term name="Unique visitor">Distinct people (browsers) — counted once even if they open many pages.</Term>
        <Term name="New visitor">Someone whose very first visit ever happened on the day you&apos;re looking at.</Term>
        <Term name="Returning visitor">Someone who visited that day but had been to the site before. (Returning = Unique − New.)</Term>
        <Term name="Page view">Every single page load. One person can create many page views in one visit.</Term>
        <Term name="Match view">When someone opens a match&apos;s watch page. Tracked separately from general site visits.</Term>
        <Term name="Online Now">People on the site right now — active in the last 2 minutes.</Term>
        <Term name="Live Viewer">Someone currently on a match&apos;s watch page with the player open — our best signal for &ldquo;watching a stream right now&rdquo; (we can&apos;t see play-clicks inside the video itself).</Term>
        <Term name="Live vs Upcoming">Live = the match is playing now (or near kickoff) and has a watchable stream. Upcoming = scheduled but not started.</Term>
      </Section>

      {/* Overview */}
      <Section title="Overview" subtitle="The home dashboard — a quick health check of today.">
        <Term name="Today&apos;s Visitors">Unique people who visited today, with total page views underneath.</Term>
        <Term name="Online Now">People on the site right now (active in the last 2 minutes).</Term>
        <Term name="Live Viewers">People watching a stream right now (currently on a match&apos;s watch page).</Term>
        <Term name="Match Views Today">How many times a match watch page was opened today.</Term>
        <Term name="Total Views (7d)">All page loads across the last 7 days.</Term>
        <Term name="Daily Visitors chart">Unique visitors per day for the last 30 days (uses saved daily summaries).</Term>
        <Term name="Sport Breakdown">Which sports were watched the most over the last 7 days.</Term>
        <Term name="Top Matches">The most-watched matches today.</Term>
      </Section>

      {/* Visitors */}
      <Section title="Visitors" subtitle="Detailed analytics of who visits the site (not who watches matches).">
        <Term name="Today / Yesterday / date">Pick any day to see that day&apos;s numbers. Days are UTC.</Term>
        <Term name="Unique Visitors">Distinct people that day.</Term>
        <Term name="New Visitors">People whose first-ever visit was that day.</Term>
        <Term name="Returning">People who visited that day but had been here before.</Term>
        <Term name="Page Views">Total page loads that day (repeat pages included).</Term>
        <Term name="Total Visitors">Everyone who has ever visited the site, all-time.</Term>
        <Term name="30-day trend">Unique vs new visitors over the last month.</Term>
        <Term name="Devices / By hour">The device split and the busiest hours for the chosen day (UTC).</Term>
        <Term name="Latest Visitors">The most recent people to join, each tagged NEW or RETURNING, with their device, where they came from, and how many pages they&apos;ve viewed.</Term>
      </Section>

      {/* Traffic */}
      <Section title="Traffic" subtitle="Where visits come from and what they look like.">
        <Term name="Daily Visitors">Unique visitors, total views and match views over the chosen range (30/60/90 days).</Term>
        <Term name="Device Breakdown">Share of mobile vs desktop vs tablet.</Term>
        <Term name="Top Referrers">Where people came from (e.g. google.com). &ldquo;Direct&rdquo; means they typed the address or used a bookmark.</Term>
        <Term name="Top Pages">The most-visited pages on the site.</Term>
      </Section>

      {/* Pages */}
      <Section title="Pages" subtitle="Which pages people are on now and which get the most views.">
        <Term name="Online Now">People on the site right now (last 2 minutes).</Term>
        <Term name="Viewing right now">The exact pages people are on at this moment, each with a live count.</Term>
        <Term name="Total / Unique Views">For the chosen day: total page loads, and the distinct people who loaded them.</Term>
        <Term name="Views / user">Average times each person viewed that page (Views ÷ Unique).</Term>
        <Term name="Pages — most viewed">Every page ranked by views, so you can see what people check most (e.g. Home vs Football vs a match).</Term>
      </Section>

      {/* Match Analytics */}
      <Section title="Matches (Match Analytics)" subtitle="How individual matches performed. Filter by sport.">
        <Term name="Views">How many times that match&apos;s watch page was opened.</Term>
        <Term name="Unique">Distinct people who watched that match.</Term>
        <Term name="Avg Duration">Average time people spent watching it (measured in ~30-second pings).</Term>
        <Term name="Last Viewed">The most recent time someone opened it.</Term>
      </Section>

      {/* Live Monitor */}
      <Section title="Live Monitor" subtitle="What's happening on the site right now (refreshes every 10s).">
        <Term name="Online Now / Live Viewers">Online Now = everyone on the site in the last 2 minutes. Live Viewers = those currently on a watch page (watching a stream).</Term>
        <Term name="Live Streams — viewers watching now">Which matches have viewers right now and how many. Use the Override button to inject a stream into a match someone is watching.</Term>
        <Term name="Active by page">Where the currently-active people are on the site.</Term>
        <Term name="Recent Activity">The latest page loads as they happen.</Term>
        <Term name="Stream Overrides">Matches you&apos;ve manually given streams to (toggle, rename or remove each server).</Term>
      </Section>

      {/* Streams / Match Manager */}
      <Section title="Streams (Match Manager)" subtitle="Control which matches are watchable. Lists every live & upcoming match.">
        <Term name="Serving badge">How a live match is being streamed: <b>Echo</b> = the main source has it; <b>Auto</b> = the automatic fallback found a stream; <b>Manual</b> = you added one; <b>No stream</b> = nothing available, so it&apos;s hidden from the public site.</Term>
        <Term name="Add fallback">Search the fallback provider for that match, or paste a stream link yourself.</Term>
        <Term name="Force live">Show a match as live on the site immediately — even before its scheduled kickoff.</Term>
        <Term name="Hide">Remove a match from the public site entirely.</Term>
        <Term name="Disable auto-fallback">Stop the automatic fallback search for that specific match.</Term>
      </Section>

      {/* Settings */}
      <Section title="Settings" subtitle="Account and data maintenance.">
        <Term name="Change Password">Update your admin login password.</Term>
        <Term name="Run Daily Aggregation">Processes raw visits into the daily summaries that power the Overview and Traffic charts. Run it if those charts look stale or empty.</Term>
        <Term name="Connection Status">Confirms the database (Supabase) is connected.</Term>
      </Section>

      <p className="text-[11px] text-gray-400">
        Note: visitor counts are per-browser estimates — incognito mode, clearing cache, or using a second device each create a new visitor ID. This is normal for cookieless analytics.
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import InfoPage, { InfoSection, CONTACT_EMAIL } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "About PrimePitch",
  description: "What PrimePitch is, how it works, and who is behind it.",
};

export default function AboutPage() {
  return (
    <InfoPage
      title="About PrimePitch"
      intro="PrimePitch is a sports schedule and stream directory. It lists upcoming and live fixtures across football, basketball, NFL, UFC, boxing, motorsport, tennis, cricket and more, and points you to third-party streams for each one."
      current="/about"
    >
      <InfoSection title="What we do">
        <p>
          We gather fixture lists from public sports data feeds and show them in one place, with kickoff times in your
          local time, team badges and live scores where available. For each fixture we list the third-party servers
          that are known to carry a stream of it, so you can pick one and watch.
        </p>
        <p>
          PrimePitch does not host, upload, encode or produce any video. Every stream listed on this site is hosted
          and served by a third party, and remains that party&rsquo;s responsibility. We are a directory, in the same
          way a TV guide is a directory.
        </p>
      </InfoSection>

      <InfoSection title="How the site works">
        <p>
          The home page lists what&rsquo;s live now and what&rsquo;s coming up. Tap a fixture to open its match page,
          where you&rsquo;ll find the servers available for it &mdash; before kickoff, during the match and, for a
          while, after. If a server doesn&rsquo;t play well for you, pick a different one. The{" "}
          <Link href="/alt" className="text-emerald-700 font-semibold underline underline-offset-4">Alt</Link> page lists a
          hand-picked set of matches with our own curated servers.
        </p>
        <p>
          Streams are sometimes blocked by networks or regions. Our{" "}
          <Link href="/help" className="text-emerald-700 font-semibold underline underline-offset-4">help page</Link>{" "}
          explains what to do when a match won&rsquo;t play.
        </p>
      </InfoSection>

      <InfoSection title="Advertising">
        <p>
          PrimePitch is free to use and is funded by advertising from third-party ad networks. Ads may open in a new
          tab when you interact with the site. We never ask for payment details or personal information to watch.
        </p>
      </InfoSection>

      <InfoSection title="Rights holders">
        <p>
          We respect the rights of broadcasters and leagues. If you believe a link on this site points to content
          that infringes your rights, our{" "}
          <Link href="/dmca" className="text-emerald-700 font-semibold underline underline-offset-4">DMCA page</Link>{" "}
          explains how to send a takedown notice. We act on valid notices promptly.
        </p>
      </InfoSection>

      <InfoSection title="Get in touch">
        <p>
          Questions, feedback or a broken link? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-700 font-semibold underline underline-offset-4">{CONTACT_EMAIL}</a>{" "}
          or use the channels on our{" "}
          <Link href="/contact" className="text-emerald-700 font-semibold underline underline-offset-4">contact page</Link>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}

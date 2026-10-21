import type { Metadata } from "next";
import Link from "next/link";
import InfoPage, { InfoSection, CONTACT_EMAIL } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Privacy Policy — PrimePitch",
  description: "What PrimePitch collects, why, and what it does with it.",
};

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy Policy"
      intro="This page explains what information PrimePitch collects when you use the site, what it is used for, and the choices you have. We keep it short and in plain language."
      current="/privacy"
    >
      <InfoSection title="No accounts, no sign-up">
        <p>
          You don&rsquo;t need an account to use PrimePitch, and we never ask for your name, email address, phone
          number or payment details to watch. The only time you give us an email is if you choose to contact us.
        </p>
      </InfoSection>

      <InfoSection title="What we collect automatically">
        <p>When you visit, we record basic usage information so we can run the site and see what people watch:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>A random visitor ID stored in your browser, so we can count a returning device as one visitor rather than many.</li>
          <li>The pages and matches you open, when you opened them, and which page you came from (the referrer).</li>
          <li>Your approximate country, worked out from your network address, and whether you are on a phone or a computer.</li>
          <li>Whether a stream started and how long the page stayed open, so we can tell which servers work.</li>
        </ul>
        <p>
          We do not store your full IP address with your activity, and we do not try to identify you personally. We
          also use Google Analytics, which collects similar usage statistics under{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-semibold underline underline-offset-4">Google&rsquo;s privacy policy</a>.
        </p>
      </InfoSection>

      <InfoSection title="Cookies and browser storage">
        <p>We use a small number of cookies and browser storage entries:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Visitor ID</strong> &mdash; the random identifier described above.</li>
          <li><strong>Preferences</strong> &mdash; things like the last sport tab you chose or whether you dismissed a banner, so the site remembers them next time.</li>
          <li><strong>Referral</strong> &mdash; if you arrived through a partner&rsquo;s link, a cookie remembers that partner for up to a year so they can be credited for your visit.</li>
          <li><strong>Advertising</strong> &mdash; our ad networks may set their own cookies to limit how often you see an ad. These are governed by the networks&rsquo; own policies.</li>
        </ul>
        <p>You can clear or block cookies in your browser settings at any time. The site still works without them.</p>
      </InfoSection>

      <InfoSection title="Match alerts (push notifications)">
        <p>
          If you turn on match alerts, your browser gives us a push subscription so we can send you notifications about
          the fixtures you follow. We store that subscription and your alert preferences, nothing else. Turning alerts
          off, or blocking notifications in your browser, removes it.
        </p>
      </InfoSection>

      <InfoSection title="Advertising">
        <p>
          PrimePitch is funded by third-party advertising. Ad networks may use cookies or similar technologies to show
          ads and measure them. We don&rsquo;t share the usage data we collect with them, and they don&rsquo;t share
          their data with us.
        </p>
      </InfoSection>

      <InfoSection title="Third-party streams">
        <p>
          The video you watch is served by third-party sites inside a player on our page. Those sites may collect their
          own data when their player loads, under their own policies. We don&rsquo;t control what they collect.
        </p>
      </InfoSection>

      <InfoSection title="How long we keep data">
        <p>
          Usage statistics are kept for as long as they are useful for running the site, and summarised or deleted
          after that. Push subscriptions are kept until you turn alerts off or they stop working.
        </p>
      </InfoSection>

      <InfoSection title="Your choices">
        <ul className="list-disc pl-5 space-y-1">
          <li>Clear your browser&rsquo;s cookies and site data to reset your visitor ID and preferences.</li>
          <li>Turn off match alerts on the <Link href="/subscribe" className="text-emerald-700 font-semibold underline underline-offset-4">alerts page</Link> or in your browser.</li>
          <li>Email us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-700 font-semibold underline underline-offset-4">{CONTACT_EMAIL}</a> with any question about your data.</li>
        </ul>
      </InfoSection>

      <InfoSection title="Children">
        <p>PrimePitch is not directed at children under 13, and we don&rsquo;t knowingly collect information from them.</p>
      </InfoSection>

      <InfoSection title="Changes">
        <p>If this policy changes, the new version will be posted here with a new date at the top.</p>
      </InfoSection>
    </InfoPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import InfoPage, { InfoSection, CONTACT_EMAIL } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Terms of Service — PrimePitch",
  description: "The terms that apply when you use PrimePitch.",
};

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms of Service"
      intro="By using PrimePitch you agree to these terms. They are short, and they exist mainly to be clear about what the site is and isn't."
      current="/terms"
    >
      <InfoSection title="1. What PrimePitch is">
        <p>
          PrimePitch is a directory of sports fixtures and links to third-party streams. We do not host, upload,
          encode or produce any video. The streams listed on this site are provided by independent third parties,
          who are solely responsible for them.
        </p>
      </InfoSection>

      <InfoSection title="2. Third-party content">
        <p>
          Streams open inside a player on our pages but are served from other websites. We have no control over
          their availability, quality, legality or the advertising they show, and we make no promises about any of
          those things. Your use of a third-party stream is between you and that third party, at your own risk.
        </p>
      </InfoSection>

      <InfoSection title="3. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Use the site for anything unlawful in your country.</li>
          <li>Try to break, overload, scrape or interfere with the site, its data feeds or its servers.</li>
          <li>Copy the site&rsquo;s listings or design to present them as your own.</li>
          <li>Use bots or automated tools to generate traffic, ad views or clicks.</li>
        </ul>
      </InfoSection>

      <InfoSection title="4. Advertising">
        <p>
          PrimePitch is free and supported by advertising from third-party networks. Ads may open in a new tab when
          you interact with the site. We don&rsquo;t endorse any product advertised and aren&rsquo;t responsible for
          advertisers&rsquo; sites.
        </p>
      </InfoSection>

      <InfoSection title="5. Partners">
        <p>
          Some visitors arrive through links shared by partners. Partners agree to separate partner terms when they
          join the programme; nothing in those terms changes your rights as a visitor.
        </p>
      </InfoSection>

      <InfoSection title="6. No warranty">
        <p>
          The site is provided &ldquo;as is&rdquo;. Fixture times, scores and stream availability come from external
          feeds and can be late, wrong or missing. We do our best to keep them accurate but can&rsquo;t guarantee it.
        </p>
      </InfoSection>

      <InfoSection title="7. Limitation of liability">
        <p>
          To the fullest extent allowed by law, PrimePitch is not liable for any loss or damage arising from your use
          of the site or of any third-party stream, server or advertiser reached through it.
        </p>
      </InfoSection>

      <InfoSection title="8. Rights holders">
        <p>
          If you believe a link on this site infringes your rights, please follow the process on our{" "}
          <Link href="/dmca" className="text-emerald-700 font-semibold underline underline-offset-4">DMCA page</Link>.
          We act on valid notices promptly.
        </p>
      </InfoSection>

      <InfoSection title="9. Changes to these terms">
        <p>
          We may update these terms from time to time. The date at the top shows when they last changed. Continuing to
          use the site after a change means you accept the new terms.
        </p>
      </InfoSection>

      <InfoSection title="10. Contact">
        <p>
          Questions about these terms: email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-700 font-semibold underline underline-offset-4">{CONTACT_EMAIL}</a>{" "}
          or see the <Link href="/contact" className="text-emerald-700 font-semibold underline underline-offset-4">contact page</Link>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}

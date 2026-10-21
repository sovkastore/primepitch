import type { Metadata } from "next";
import InfoPage, { InfoSection, CONTACT_EMAIL } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "DMCA / Copyright — PrimePitch",
  description: "How to send PrimePitch a copyright takedown notice, and what happens next.",
};

export default function DmcaPage() {
  return (
    <InfoPage
      title="DMCA & Copyright"
      intro="PrimePitch respects the intellectual property of broadcasters, leagues and rights holders. This page explains how to report a link you believe infringes your rights, and what we do when we receive a notice."
      current="/dmca"
    >
      <InfoSection title="What we host">
        <p>
          PrimePitch does not host, store, upload or transmit any video. The site lists sports fixtures and links to
          streams that are hosted on third-party websites, which we do not own or control. Removing a link from
          PrimePitch does not remove the stream from the third-party site that hosts it; notices about the stream
          itself should also go to that site.
        </p>
      </InfoSection>

      <InfoSection title="How to send a takedown notice">
        <p>
          Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-700 font-semibold underline underline-offset-4">{CONTACT_EMAIL}</a>{" "}
          with the subject line <strong>&ldquo;DMCA notice&rdquo;</strong> and include:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>The copyrighted work you say has been infringed (for example, the match or broadcast, and who holds the rights).</li>
          <li>The exact PrimePitch URL(s) where the link appears, so we can find it. A screenshot helps.</li>
          <li>Your name, the organisation you represent, and a contact email address.</li>
          <li>A statement that you have a good-faith belief the use is not authorised by the rights holder, its agent or the law.</li>
          <li>A statement, under penalty of perjury, that the information in your notice is accurate and that you are the rights holder or authorised to act for them.</li>
          <li>Your physical or electronic signature.</li>
        </ol>
      </InfoSection>

      <InfoSection title="What happens next">
        <ul className="list-disc pl-5 space-y-1">
          <li>We review notices as soon as they arrive, normally within one business day.</li>
          <li>Valid notices are acted on promptly: the link is removed from the site.</li>
          <li>We reply to the address on the notice to confirm what was done.</li>
          <li>Incomplete notices are answered with a request for the missing information.</li>
        </ul>
      </InfoSection>

      <InfoSection title="Counter-notices">
        <p>
          If a link you added as a partner was removed and you believe that was a mistake, email the same address with
          the subject <strong>&ldquo;DMCA counter-notice&rdquo;</strong>, the URL that was removed, and an explanation.
          We will review it and reply.
        </p>
      </InfoSection>

      <InfoSection title="Repeat infringement">
        <p>
          Sources that are the subject of repeated valid notices are removed from the site entirely.
        </p>
      </InfoSection>

      <InfoSection title="Contact">
        <p>
          All copyright matters: <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-700 font-semibold underline underline-offset-4">{CONTACT_EMAIL}</a>
        </p>
      </InfoSection>
    </InfoPage>
  );
}

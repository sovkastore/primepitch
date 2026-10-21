import type { Metadata } from "next";
import VipClient from "./VipClient";

export const metadata: Metadata = {
  title: "PrimePitch VIP — watch without the ads",
  description: "No ads from PrimePitch anywhere, and 100% ad-free VIP Streams for the big matches. Pay with crypto, from $5.",
};

export default function VipPage() {
  return <VipClient />;
}

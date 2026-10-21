import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import VipClient from "./VipClient";
import { isVipLive } from "@/lib/vip-live";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PrimePitch VIP — watch without the ads",
  description: "No ads from PrimePitch anywhere, and 100% ad-free VIP Streams for the big matches. Pay with crypto, from $10.",
};

export default async function VipPage() {
  // Hidden until launched — except for a signed-in admin, who can test it.
  if (!(await isVipLive())) {
    const token = (await cookies()).get(ADMIN_COOKIE)?.value;
    const admin = token ? await verifyAdminSession(token) : null;
    if (!admin) notFound();
  }
  return <VipClient />;
}

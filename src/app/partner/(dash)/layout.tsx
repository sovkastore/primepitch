import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, PARTNER_COOKIE } from "@/lib/partner-auth";
import PartnerShell from "@/components/partner/PartnerShell";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const sess = await verifySession(jar.get(PARTNER_COOKIE)?.value);
  if (!sess) redirect("/partner/login");
  return <PartnerShell name={sess.name || sess.code}>{children}</PartnerShell>;
}

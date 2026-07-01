import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Analytics from "@/components/Analytics";
import StaleSessionReset from "@/components/StaleSessionReset";
import AnnouncementBar from "@/components/AnnouncementBar";
import WhatsAppBanner from "@/components/WhatsAppBanner";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <Analytics />
      <StaleSessionReset />
      <WhatsAppBanner />
    </>
  );
}

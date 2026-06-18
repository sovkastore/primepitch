import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import Analytics from "@/components/Analytics";
import StaleSessionReset from "@/components/StaleSessionReset";
import AnnouncementBar from "@/components/AnnouncementBar";

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
      {/* BottomNav removed */}
      <Analytics />
      <StaleSessionReset />
    </>
  );
}

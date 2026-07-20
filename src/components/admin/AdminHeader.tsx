"use client";

import { useRouter } from "next/navigation";

export default function AdminHeader({
  onMenuToggle,
}: {
  onMenuToggle: () => void;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
      <button
        onClick={onMenuToggle}
        className="lg:hidden text-gray-500 hover:text-gray-900"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="lg:block hidden" />

      <button
        onClick={handleLogout}
        className="text-[12px] font-semibold text-gray-500 hover:text-red-500 transition-colors"
      >
        Sign Out
      </button>
    </header>
  );
}

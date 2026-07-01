import React from "react";
import Link from "next/link";

export default function DisclaimerFooter() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="w-full bg-[#0a0a0a] border-t border-gray-800/50 mt-12 overflow-hidden">
      <div className="max-w-[1100px] mx-auto px-6 py-12">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
          {/* Disclaimer Title */}
          <h2 className="text-[14px] font-black text-gray-100 uppercase tracking-[0.2em] mb-6">
            Disclaimer
          </h2>
          
          {/* Disclaimer Body */}
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-gray-400 font-medium">
              <span className="text-emerald-500 font-bold">PrimePitch</span> is an aggregation platform that provides links to publicly available sports content. 
              We do not host, upload, encode, or produce any streaming content ourselves.
            </p>
            
            <p className="text-[13px] leading-relaxed text-gray-400 font-medium">
              All streams are sourced from third parties and remain their responsibility. Users access third-party 
              streams at their own risk. <span className="text-emerald-500 font-bold">PrimePitch</span> is not liable for content quality, availability, legality, or 
              interruptions. We comply with DMCA takedown requests and encourage users to 
              <span className="text-emerald-100 font-bold"> support official broadcasters.</span>
            </p>
          </div>

          {/* Nav Links */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mt-10">
            <Link href="/help" className="text-[12px] font-bold text-red-500 hover:text-red-400 transition-colors uppercase tracking-widest underline decoration-2 underline-offset-4">Privacy Policy</Link>
            <span className="w-1 h-1 rounded-full bg-gray-700" />
            <Link href="/help" className="text-[12px] font-bold text-red-500 hover:text-red-400 transition-colors uppercase tracking-widest underline decoration-2 underline-offset-4">Terms of Service</Link>
            <span className="w-1 h-1 rounded-full bg-gray-700" />
            <Link href="/help" className="text-[12px] font-bold text-red-500 hover:text-red-400 transition-colors uppercase tracking-widest underline decoration-2 underline-offset-4">DMCA</Link>
            <span className="w-1 h-1 rounded-full bg-gray-700" />
            <Link href="/help" className="text-[12px] font-bold text-red-500 hover:text-red-400 transition-colors uppercase tracking-widest underline decoration-2 underline-offset-4">Contact</Link>
          </div>

          {/* Copyright */}
          <div className="mt-12 flex flex-col items-center gap-3">
             <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.3em]">
               © {currentYear} PrimePitch
             </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

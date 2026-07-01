"use client";

import { useEffect, useState } from "react";

export default function WhatsAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if user dismissed it in the last 24 hours
    const lastDismissed = localStorage.getItem("whatsapp_dismissed");
    const now = Date.now();
    
    if (!lastDismissed || now - parseInt(lastDismissed) > 24 * 60 * 60 * 1000) {
      // Show after a short delay for better UX
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem("whatsapp_dismissed", Date.now().toString());
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-8 md:w-[380px] z-[100] animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="bg-white rounded-[2rem] shadow-2xl shadow-emerald-500/10 border border-emerald-100 overflow-hidden">
        <div className="p-1 bg-emerald-500 flex items-center justify-between px-4 py-1.5">
           <span className="text-[10px] font-black text-white uppercase tracking-widest">Sponsored</span>
           <button onClick={dismiss} className="text-white/80 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/></svg>
           </button>
        </div>
        <div className="p-6 flex items-center gap-5">
           <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
             <svg className="w-8 h-8 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
             </svg>
           </div>
           <div>
              <h4 className="text-gray-900 font-black text-[17px] leading-tight mb-1">Get Live Updates!</h4>
              <p className="text-gray-500 text-[13px] font-bold leading-snug">
                Join our WhatsApp group for premium stream links and match notifications.
              </p>
           </div>
        </div>
        <div className="p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-2 gap-3">
           <button onClick={dismiss} className="py-2.5 bg-white border border-gray-200 text-gray-500 text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-colors">Dismiss</button>
           <a 
             href="https://chat.whatsapp.com/GZIDDAtkCOg9r8p25itF9t" 
             target="_blank" 
             rel="noopener noreferrer"
             onClick={dismiss}
             className="py-2.5 bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 text-center"
           >
              Join Now
           </a>
        </div>
      </div>
    </div>
  );
}

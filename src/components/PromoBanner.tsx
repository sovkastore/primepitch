"use client";

import { useEffect, useState } from "react";

type AdsConfig = any; // Assuming it fetches the same structure

export default function PromoBanner() {
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/ads-config")
      .then((res) => res.json())
      .then((data: AdsConfig) => {
        if (mounted && data?.promoBanner?.enabled) {
          setConfig(data.promoBanner);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  if (!config || !config.enabled) return null;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 lg:px-6 my-6">
      <a 
        href={config.link} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="block w-full overflow-hidden rounded-2xl hover:opacity-95 transition-opacity border border-gray-100 shadow-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={config.imagePath} 
          alt="Sports Platform Banner" 
          className="w-full h-auto block" 
        />
      </a>
    </div>
  );
}

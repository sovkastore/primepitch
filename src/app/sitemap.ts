import type { MetadataRoute } from "next";

const SPORTS = [
  "football", "basketball", "american-football", "hockey", "baseball",
  "motor-sports", "ufc", "wwe", "boxing", "tennis", "rugby", "golf",
  "billiards", "afl", "darts", "cricket",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const sportPages = SPORTS.map((sport) => ({
    url: `https://primepitch.live/${sport}`,
    lastModified: new Date(),
    changeFrequency: "hourly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: "https://primepitch.live",
      lastModified: new Date(),
      changeFrequency: "always",
      priority: 1,
    },
    ...sportPages,
  ];
}

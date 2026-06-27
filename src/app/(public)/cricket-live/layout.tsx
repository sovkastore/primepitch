import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cricket Live | Watch Sky Sports, Willow & Star Sports Free",
  description: "Watch live cricket matches from around the world. Stream Sky Sports Cricket, Willow, and Star Sports in HD for free on PrimePitch.",
};

export default function CricketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Astrolabe — Your codebase mentor",
  description:
    "A source-backed notebook for understanding an unfamiliar repository. Explore, ask, predict, and verify.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Codebase Mentor — Find your first contribution",
  description:
    "Explore real source. Predict what happens. Build your understanding, one small step at a time.",
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

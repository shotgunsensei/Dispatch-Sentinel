import type { Metadata } from "next";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "Dispatch Sentinel Admin",
  description: "Dispatch Sentinel tenant setup and integration control center"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

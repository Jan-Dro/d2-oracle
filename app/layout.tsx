import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arsenal//Oracle — Find Your God Roll",
  description: "Search curated Destiny 2 weapon god rolls for PVE and PVP.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "PharmacyDeck",
  description: "Pharmaceutical intelligence interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Nav Link={Link as React.ComponentType<{ href: string; className?: string; children: React.ReactNode }>} />
        {children}
      </body>
    </html>
  );
}

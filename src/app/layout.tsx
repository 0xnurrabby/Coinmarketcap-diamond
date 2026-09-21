import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const haas = Inter({
  variable: "--font-haas",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "DiamondClaim",
  description: "CMC diamond auto claim",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${haas.variable} h-full`} suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col font-sans bg-surface-soft text-body"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter, Noto_Sans_Ethiopic } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const ethiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic"],
  variable: "--font-ethiopic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ethiopian Legal RAG — Bilingual Legal Research | የኢትዮጵያ ሕግ ምርምር",
  description:
    "Bilingual (Amharic/English) Ethiopian legal research assistant grounded in indexed official gazette sources. It provides legal information, not legal advice.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${fraunces.variable} ${ethiopic.variable} bg-paper-100 font-sans text-ink-900 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

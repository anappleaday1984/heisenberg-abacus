import type { Metadata } from "next";
import "./globals.css";
import { PersonaSessionProvider } from "@/lib/persona-session-context";
import { ProductParamsProvider } from "@/lib/product-params-context";

export const metadata: Metadata = {
  title: "海森堡的算盤 — 人類行為觀測站",
  description: "Multi-agent virtual persona market research",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>
        <PersonaSessionProvider>
          <ProductParamsProvider>{children}</ProductParamsProvider>
        </PersonaSessionProvider>
      </body>
    </html>
  );
}

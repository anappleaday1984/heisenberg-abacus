import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PersonaSessionProvider } from "@/lib/persona-session-context";
import { ProductParamsProvider } from "@/lib/product-params-context";

export const metadata: Metadata = {
  title: "海森堡的算盤 — 人類行為觀測站",
  description: "Multi-agent virtual persona market research",
};

// 鎖縮放 — 手機 input focus 時 iOS 預設會把畫面 zoom 到 input 位置。
// 我們用隱藏 input 做鍵盤輸入,zoom 會把整個 stage 拉歪,所以禁掉。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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

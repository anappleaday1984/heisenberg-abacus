import { Converter } from "opencc-js";

// 簡體 → 繁體（台灣標準，含台灣慣用詞，例如 视频 → 影片、软件 → 軟體）
const toTW = Converter({ from: "cn", to: "tw" });

export function toTraditional(text: string): string {
  return toTW(text);
}

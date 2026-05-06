import Anthropic from "@anthropic-ai/sdk";

if (!process.env.MINIMAX_API_KEY) {
  throw new Error("MINIMAX_API_KEY is not set");
}

// MiniMax 提供 Anthropic SDK 相容的 endpoint，所以可以直接用 @anthropic-ai/sdk
// 只需要把 baseURL 指向 MiniMax 的 /anthropic 路徑
export const anthropic = new Anthropic({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: "https://api.minimax.io/anthropic",
});

export const MODEL = "MiniMax-M2.5";

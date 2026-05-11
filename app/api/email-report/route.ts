import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { findUserByAccount, SESSION_COOKIE_NAME } from "@/lib/auth";
import type { FullReportPayload } from "@/lib/orchestrator";
import { reportToMarkdown } from "@/lib/report-markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RECIPIENT = "the.ai.hack.project@gmail.com";

/** 把純文字 body 包成簡單 HTML，提升 Gmail 投遞率（純文字附件信偶爾被誤判為垃圾）*/
function textBodyToHtml(text: string, data: FullReportPayload): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const lines = text
    .split("\n")
    .map((l) => {
      const m = l.match(/^\*\*(.+?)\*\*：(.+)$/);
      if (m) return `<p><strong>${escape(m[1])}</strong>：${escape(m[2])}</p>`;
      if (l.startsWith("> ")) return `<blockquote style="border-left:3px solid #a78bfa;padding-left:12px;color:#475569;">${escape(l.slice(2))}</blockquote>`;
      if (l.trim() === "—") return "<hr/>";
      return `<p>${escape(l)}</p>`;
    })
    .join("");
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0f172a;line-height:1.6;max-width:640px;margin:0 auto;padding:24px;">
<h2 style="color:#7c3aed;margin:0 0 12px;">📋 ${escape(data.report.title)}</h2>
${lines}
<p style="color:#94a3b8;font-size:12px;margin-top:24px;">— 海森堡的算盤 · 人類行為觀測站</p>
</body></html>`;
}

/** 產生「YYYYMMDD_HHMMSS」格式戳記（台灣時區） */
function formatTaipeiStamp(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}_${get("hour")}${get("minute")}${get("second")}`;
}

type Body = {
  /** 報告完整 payload — server 會自己 render Markdown 附件 */
  data: FullReportPayload;
  /** PDF base64（不含 data:URL 前綴）— 由前端 jspdf 產生後送過來 */
  pdfBase64: string;
  /** 收件者，省略時預設寄到 the.ai.hack.project@gmail.com */
  to?: string;
};

export async function POST(req: Request) {
  // 必須登入
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = session ? findUserByAccount(session) : null;
  if (!user) {
    return NextResponse.json(
      { error: "請先登入後再使用此服務" },
      { status: 401 }
    );
  }

  const gmailUser = process.env.GMAIL_USER?.trim();
  // Gmail App Password 是 16 字元、複製時常含空白；自動清掉避免 SMTP 認證錯誤
  const gmailPass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      {
        error:
          "後端尚未設定 GMAIL_USER / GMAIL_APP_PASSWORD — 請至 https://myaccount.google.com/apppasswords 產生應用程式密碼後寫入 .env.local",
      },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "請求 body 不是合法 JSON" }, { status: 400 });
  }

  const { data, pdfBase64 } = body;
  const to = body.to?.trim() || DEFAULT_RECIPIENT;
  if (!data?.report || !data.summary || !data.plan || !data.personas) {
    return NextResponse.json(
      { error: "報告 payload 缺欄位（需要 report / summary / plan / personas）" },
      { status: 400 }
    );
  }
  if (!pdfBase64 || pdfBase64.length < 1000) {
    return NextResponse.json(
      { error: "PDF base64 太短或缺，請重新產生報告" },
      { status: 400 }
    );
  }
  // Gmail 單封信附件上限 25 MB — base64 解碼後實際 byte 數
  // 給 20 MB 緩衝，超過直接擋下避免 SMTP 寄出後被 Gmail 退信
  const pdfBytes = Math.round((pdfBase64.length * 3) / 4);
  const MAX_PDF_BYTES = 20 * 1024 * 1024;
  if (pdfBytes > MAX_PDF_BYTES) {
    return NextResponse.json(
      {
        error: `PDF ${(pdfBytes / 1024 / 1024).toFixed(1)} MB 超過寄信上限 ${MAX_PDF_BYTES / 1024 / 1024} MB（Gmail 限制 25 MB），請改用「下載 PDF」按鈕`,
      },
      { status: 413 }
    );
  }

  const md = reportToMarkdown(data);
  // 用台灣時間產生 YYYYMMDD_HHMMSS 戳記（給主旨 / 檔名共用）
  const stamp = formatTaipeiStamp(new Date());
  const pdfFilename = `heisenberg-report-${stamp}.pdf`;
  const mdFilename = `heisenberg-report-${stamp}.md`;

  const pdfSize = Math.round((pdfBase64.length * 3) / 4 / 1024);
  const mdSize = Math.round(Buffer.byteLength(md, "utf-8") / 1024);
  console.log(
    `[email-report] payload PDF=${pdfSize} KB · MD=${mdSize} KB · to=${to}`
  );

  // Gmail SMTP — 使用 App Password。Port 587 STARTTLS 比 465 SSL 對某些網路更友善
  // （部分 ISP / 公司內網會偷吃 465 但放行 587）。
  // 加 timeout 讓連線 / 握手 / AUTH / 傳輸卡住時都能 fail fast。
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS upgrade
    requireTLS: true,
    auth: { user: gmailUser, pass: gmailPass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000, // 給附件傳輸多一點時間（PDF 可能 1-3 MB）
  });

  // 先 verify 帳密 + 連線 — 失敗時馬上回前端，避免 sendMail 卡住
  try {
    console.log("[email-report] SMTP verify…");
    await transport.verify();
    console.log("[email-report] SMTP verified, sending…");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email-report] SMTP verify 失敗：", msg);
    return NextResponse.json(
      {
        error: `SMTP 連線/認證失敗：${msg}（請確認 GMAIL_APP_PASSWORD 是 16 字元的 App Password、且 Gmail 帳號已開 2FA）`,
      },
      { status: 502 }
    );
  }

  const subject = `[海森堡的算盤]分析報告_${stamp}`;
  const textBody = [
    "海森堡的算盤 · 自動產生報告",
    "",
    `**報告標題**：${data.report.title}`,
    `**訪談人數**：${data.personas.length} 位虛擬受訪者`,
    `**問題數**：${data.plan.questions.length} 道`,
    `**產生時間**：${new Date(data.generatedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
    `**送件人**：${user.name}（${user.account}）`,
    "",
    "—",
    "",
    "完整 PDF 與 Markdown 報告請見附件。",
    "",
    `> ${data.summary.keyTakeaway || data.report.executiveSummary}`,
  ].join("\n");

  try {
    const t0 = Date.now();
    console.log("[email-report] sendMail starting…");
    const info = await transport.sendMail({
      from: `海森堡的算盤 Lab <${gmailUser}>`,
      to,
      // 自我抄送一份到寄件人帳號，方便事後追蹤；同時讓 Gmail 視為「我寄的」、降低收件方判垃圾
      bcc: gmailUser !== to ? gmailUser : undefined,
      replyTo: gmailUser,
      subject,
      // 文字內容 + 簡單 HTML — Gmail 對純文字附件信偶爾判為可疑，多一個 HTML 版能降風險
      text: textBody,
      html: textBodyToHtml(textBody, data),
      headers: {
        "X-Mailer": "Heisenberg-Abacus/1.0 (Multi-agent virtual persona research)",
        "X-Auto-Response-Suppress": "All",
        "List-Unsubscribe": `<mailto:${gmailUser}?subject=unsubscribe>`,
      },
      attachments: [
        {
          filename: pdfFilename,
          content: Buffer.from(pdfBase64, "base64"),
          contentType: "application/pdf",
        },
        {
          filename: mdFilename,
          content: md,
          contentType: "text/markdown; charset=utf-8",
        },
      ],
    });

    transport.close();
    console.log(
      `[email-report] sent to ${to} in ${((Date.now() - t0) / 1000).toFixed(1)}s · messageId=${info.messageId}`
    );
    return NextResponse.json({
      success: true,
      to,
      messageId: info.messageId,
      attachments: [pdfFilename, mdFilename],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email-report] sendMail 失敗：", msg);
    transport.close();
    return NextResponse.json(
      { error: `寄信失敗：${msg}` },
      { status: 502 }
    );
  }
}

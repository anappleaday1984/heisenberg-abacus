// 測試 GMAIL SMTP 是否能 verify + 真的寄出測試信
// 用法：node --env-file=.env.local scripts/test-smtp.mjs
//      預設 port 587 STARTTLS，傳 --port=465 切換到 SSL 模式
import nodemailer from "nodemailer";

const user = process.env.GMAIL_USER?.trim();
const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

if (!user || !pass) {
  console.error("✗ GMAIL_USER 或 GMAIL_APP_PASSWORD 沒設");
  process.exit(1);
}

const portArg = process.argv.find((a) => a.startsWith("--port="))?.slice("--port=".length);
const port = Number(portArg ?? 587);
const secure = port === 465;

console.log(`→ ${user} (password length=${pass.length}) port=${port} secure=${secure}`);

const transport = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port,
  secure,
  requireTLS: !secure,
  auth: { user, pass },
  connectionTimeout: 15_000,
  greetingTimeout: 10_000,
  socketTimeout: 60_000,
});

try {
  const t0 = Date.now();
  await transport.verify();
  console.log(`✓ verify 通過（${Date.now() - t0}ms）`);

  // 實際寄一封小測試信，含 1 KB 假 PDF 附件，看傳輸有沒有卡
  const t1 = Date.now();
  const fakePdf = Buffer.alloc(1024, 0x42); // 1 KB filler
  const info = await transport.sendMail({
    from: `海森堡的算盤 <${user}>`,
    to: user, // 寄給自己
    subject: `[SMTP test] ${new Date().toISOString()}`,
    text: "這是 SMTP 連線測試信。如果你收到，代表 nodemailer + Gmail 通了。",
    attachments: [{ filename: "tiny.pdf", content: fakePdf, contentType: "application/pdf" }],
  });
  console.log(`✓ 寄信成功（${((Date.now() - t1) / 1000).toFixed(1)}s）messageId=${info.messageId}`);
  transport.close();
  process.exit(0);
} catch (err) {
  console.error(`✗ 失敗：${err?.message ?? err}`);
  console.error(err);
  transport.close();
  process.exit(1);
}

import type { FullReportPayload } from "./orchestrator";

const TONE_LABEL: Record<string, string> = {
  positive: "✅ 利多",
  neutral: "ℹ️ 中性",
  negative: "⚠️ 警訊",
};

const PRIORITY_LABEL: Record<string, string> = {
  high: "🔴 高優先",
  medium: "🟡 中優先",
  low: "🟢 低優先",
};

/**
 * 把 orchestrator 產出的 FullReportPayload 轉成可閱讀的 Markdown 文字檔。
 *
 * 內容對應 ReportCard 上的所有 section：封面、執行摘要、關鍵發現、群體比較、
 * 行動建議、受訪者背景、KPI 指標。受訪者池跟所有問題答案不放（PDF 已涵蓋；
 * MD 主要給寄信附件 + 後續 import 到別的工具用，篇幅控制在 1-2 頁）。
 */
export function reportToMarkdown(data: FullReportPayload): string {
  const { report, summary, plan, personas, generatedAt } = data;
  const date = new Date(generatedAt).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
  });

  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  lines.push("");
  lines.push(`> 海森堡的算盤 · 人類行為觀測站 · 自動產生於 ${date}`);
  lines.push(`> 訪談 ${personas.length} 位虛擬受訪者 · ${plan.questions.length} 道題目`);
  lines.push("");

  // 執行摘要
  lines.push("## 執行摘要");
  lines.push("");
  lines.push(report.executiveSummary || "（無）");
  lines.push("");

  // 一句行動建議（從 summary）
  if (summary.keyTakeaway) {
    lines.push("## 行動建議（一句話）");
    lines.push("");
    lines.push(`> **${summary.keyTakeaway}**`);
    lines.push("");
  }

  // KPI 指標
  if (summary.metrics?.length) {
    lines.push("## 關鍵指標");
    lines.push("");
    lines.push("| 指標 | 數值 | 訊號 |");
    lines.push("|---|---:|---|");
    for (const m of summary.metrics) {
      const valueStr = m.unit ? `${m.value} ${m.unit}` : m.value;
      lines.push(
        `| ${m.icon} ${m.label} | ${valueStr} | ${TONE_LABEL[m.tone] ?? m.tone} |`
      );
    }
    lines.push("");
  }

  // 群體支持度
  if (summary.groups?.length) {
    lines.push("## 族群支持度");
    lines.push("");
    lines.push("| 族群 | 分數 / 100 | 重點 |");
    lines.push("|---|---:|---|");
    for (const g of summary.groups) {
      lines.push(`| ${g.name} | ${g.score} | ${g.highlight} |`);
    }
    lines.push("");
  }

  // 重點發現
  if (report.keyFindings?.length) {
    lines.push("## 重點發現");
    lines.push("");
    report.keyFindings.forEach((f, i) => {
      lines.push(`### ${f.icon} ${i + 1}. ${f.title}`);
      lines.push("");
      lines.push(`**${f.headline}**`);
      lines.push("");
      lines.push(f.details);
      if (f.metric) {
        const tone = TONE_LABEL[f.metric.tone] ?? f.metric.tone;
        lines.push("");
        lines.push(`> 📊 **${f.metric.value}** ${f.metric.label} · ${tone}`);
      }
      lines.push("");
    });
  }

  // 族群比較表
  if (report.groupComparison?.rows?.length) {
    lines.push("## 族群比較");
    lines.push("");
    const headers = report.groupComparison.headers ?? [];
    if (headers.length) {
      lines.push(`| ${headers.join(" | ")} |`);
      lines.push(`|${headers.map(() => "---").join("|")}|`);
    }
    for (const row of report.groupComparison.rows) {
      lines.push(`| ${row.join(" | ")} |`);
    }
    lines.push("");
  }

  // 行動項
  if (report.actionItems?.length) {
    lines.push("## 行動建議");
    lines.push("");
    report.actionItems.forEach((a, i) => {
      lines.push(`### ${PRIORITY_LABEL[a.priority] ?? a.priority} ${i + 1}. ${a.title}`);
      lines.push("");
      lines.push(`**做什麼**：${a.action}`);
      lines.push("");
      lines.push(`**預期效果**：${a.expectedImpact}`);
      lines.push("");
    });
  }

  // 各 section 洞察（共識/分歧/指標/風險）
  const sec = summary.sections;
  if (sec) {
    if (sec.consensus) {
      lines.push("## 共識洞察");
      lines.push("");
      lines.push(sec.consensus);
      lines.push("");
    }
    if (sec.divergence) {
      lines.push("## 群體分歧");
      lines.push("");
      lines.push(sec.divergence);
      lines.push("");
    }
    if (sec.metrics) {
      lines.push("## 量化指標");
      lines.push("");
      lines.push(sec.metrics);
      lines.push("");
    }
    if (sec.risks) {
      lines.push("## 風險訊號");
      lines.push("");
      lines.push(sec.risks);
      lines.push("");
    }
  }

  // 訪談計畫摘要
  lines.push("## 訪談計畫");
  lines.push("");
  lines.push(`**目標**：${plan.summary}`);
  lines.push("");
  if (plan.scopeNote) {
    lines.push(`**範圍**：${plan.scopeNote}`);
    lines.push("");
  }
  lines.push("**問題清單**：");
  plan.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q}`);
  });
  lines.push("");

  // 受訪者統計
  lines.push("## 受訪者池");
  lines.push("");
  lines.push(`共 **${personas.length}** 位虛擬受訪者，涵蓋以下原型：`);
  lines.push("");
  const archetypeCounts = new Map<string, number>();
  for (const p of personas) {
    archetypeCounts.set(p.archetype, (archetypeCounts.get(p.archetype) ?? 0) + 1);
  }
  for (const [arch, count] of archetypeCounts) {
    lines.push(`- ${arch}（${count}）`);
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("_Multi-agent virtual persona market research · 海森堡的算盤 · 人類行為觀測站_");

  return lines.join("\n");
}

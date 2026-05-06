import { runEntryAgent } from "./agents/entry";
import { generateReport, planSurvey, type PMPlan, type ReportData } from "./agents/pm";
import { askPersona, parseQAAnswers, type PersonaResponse } from "./agents/persona";
import type { Persona } from "./agents/personas-data";
import { summarize, summaryToText, type SummaryData } from "./agents/summary";
import type { ChatMessage, StreamEvent } from "./agents/types";
import { getPersonas } from "./personas-store";

/** 完整報告 payload — 給前端 ReportCard 用 */
export type FullReportPayload = {
  report: ReportData;
  summary: SummaryData;
  plan: PMPlan;
  personas: Persona[];
  generatedAt: string;
};

export async function* orchestrate(
  history: ChatMessage[],
  userMessage: string
): AsyncGenerator<StreamEvent> {
  try {
    // 1. Entry agent — collect/clarify the research goal
    yield { type: "agent_start", agent: "entry", label: "制定計畫" };
    const entryGen = runEntryAgent(history, userMessage);
    let entryResult: { ready: boolean; brief: string } | undefined;
    while (true) {
      const next = await entryGen.next();
      if (next.done) {
        entryResult = next.value;
        break;
      }
      yield {
        type: "agent_text",
        agent: "entry",
        label: "制定計畫",
        text: next.value,
      };
    }
    yield { type: "agent_done", agent: "entry", label: "制定計畫" };

    if (!entryResult || !entryResult.ready) {
      yield { type: "complete" };
      return;
    }

    // 2. PM agent plans the survey (questions only — all personas always interviewed)
    yield { type: "agent_start", agent: "pm", label: "規劃調查" };
    const plan = await planSurvey(history, entryResult.brief);
    yield {
      type: "agent_text",
      agent: "pm",
      label: "規劃調查",
      text: `**調查目標**：${plan.summary}\n\n**問題**：\n${plan.questions
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n")}\n\n**訪談對象**：全部 ${getPersonas().length} 位受訪者並行訪談${
        plan.scopeNote ? `\n${plan.scopeNote}` : ""
      }`,
    };
    yield { type: "agent_done", agent: "pm", label: "規劃調查" };

    // 3. Persona agents — always run ALL personas in parallel.
    //    UI 端用 PersonaQAExplorer 一次顯示一題、3 位代表的答案，
    //    使用者可翻頁瀏覽下一題或換另外 3 位。
    const PAGE_SIZE = 3;
    const personas = getPersonas();
    const personaResponses: PersonaResponse[] = [];
    const startLabel =
      personas.length <= PAGE_SIZE
        ? `${personas.length} 位受訪者並行訪談中`
        : `${personas.length} 位受訪者並行訪談中（每頁 ${PAGE_SIZE} 位代表）`;
    yield {
      type: "agent_start",
      agent: "persona",
      label: startLabel,
    };

    // 「人格顯影」— 訪談前發出 personas snapshot + 使用者問題（給前端散佈圖判別產品類型）
    yield {
      type: "personas_intro",
      personas,
      productContext: `${userMessage}\n${plan.summary}`,
    };

    // Concurrency limit — 避免同時打太多 LLM request 觸發 MiniMax 的 rate limit
    const MAX_PARALLEL = 6;
    const results: PersonaResponse[] = new Array(personas.length);
    let nextIdx = 0;
    async function worker() {
      while (true) {
        const i = nextIdx++;
        if (i >= personas.length) return;
        results[i] = await askPersona(personas[i], plan.questions);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL, personas.length) }, worker)
    );
    personaResponses.push(...results);

    // 把每位受訪者的整段回答拆成 per-question answers，組成 explorer 用結構
    const qaEntries = results.map((r, i) => ({
      persona: personas[i],
      answers: parseQAAnswers(r.text, plan.questions.length),
    }));
    yield {
      type: "personas_qa",
      questions: plan.questions,
      entries: qaEntries,
    };
    yield {
      type: "agent_done",
      agent: "persona",
      label: startLabel,
    };

    // 4. Summary agent — output structured JSON for the visual SummaryCard
    yield { type: "agent_start", agent: "summary", label: "彙總洞察" };
    const summaryData = await summarize(plan.questions, personaResponses);
    yield {
      type: "agent_text",
      agent: "summary",
      label: "彙總洞察",
      text: JSON.stringify(summaryData),
    };
    yield { type: "agent_done", agent: "summary", label: "彙總洞察" };
    const summaryText = summaryToText(summaryData);

    // 5. PM final report — structured JSON, bundled with all upstream data
    yield { type: "agent_start", agent: "pm", label: "回報結果" };
    const report = await generateReport(plan, personaResponses, summaryText);
    const payload: FullReportPayload = {
      report,
      summary: summaryData,
      plan,
      personas,
      generatedAt: new Date().toISOString(),
    };
    yield {
      type: "agent_text",
      agent: "pm",
      label: "回報結果",
      text: JSON.stringify(payload),
    };
    yield { type: "agent_done", agent: "pm", label: "回報結果" };

    yield { type: "complete" };
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

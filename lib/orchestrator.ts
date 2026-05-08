import { runEntryAgent } from "./agents/entry";
import { generateReport, planSurvey, type PMPlan, type ReportData } from "./agents/pm";
import { askPersona, type PersonaResponse } from "./agents/persona";
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
    // 把原始 userMessage 一併送進去，讓 PM 在規劃問題時保留產品的原始規格
    // （年利率/月利率、額度、期限等數字），避免被「啟動者」摘要時失真。
    const plan = await planSurvey(history, entryResult.brief, userMessage);
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

    // Persona-level worker 數量 — 真正的速率限制由 lib/anthropic.ts 的全域
    // semaphore 控制（見 LLM_MAX_CONCURRENCY），這層只是 fan-out 多少 worker
    // 進入排隊。設大於 LLM_MAX_CONCURRENCY 沒關係，semaphore 會讓多餘的 worker
    // 排隊等候。預設拉到等同 personas.length，讓 LLM 限流是唯一節流點。
    const MAX_PARALLEL = Number(
      process.env.PERSONA_MAX_PARALLEL ?? personas.length
    );
    const results: PersonaResponse[] = new Array(personas.length);
    let nextIdx = 0;
    // 把 userMessage（原始產品規格）+ plan.summary 一併傳給每位受訪者，
    // 讓他們答題時知道是針對「這個年利率 6.88% 的微貸方案」回答，
    // 而不是憑印象猜常識（過去曾出現「年利率 6.88%」答成「月利率 1.5%」的飄移）。
    const productContext = `${userMessage}\n\n調查目標：${plan.summary}`;
    async function worker() {
      while (true) {
        const i = nextIdx++;
        if (i >= personas.length) return;
        results[i] = await askPersona(personas[i], plan.questions, productContext);
      }
    }
    await Promise.all(
      Array.from(
        { length: Math.min(Math.max(1, MAX_PARALLEL), personas.length) },
        worker
      )
    );
    personaResponses.push(...results);

    // 每位受訪者已經逐題回答，answers 直接 index 對齊 plan.questions
    const qaEntries = results.map((r, i) => ({
      persona: personas[i],
      answers: r.answers,
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
    // 同樣把 productContext 傳進去，summary 才能在報告裡正確引用本方案的
    // 「年利率 6.88%」「5 萬額度」這些原始規格，而不是抽象寫一個「月利率 1.5%」。
    const summaryData = await summarize(plan.questions, personaResponses, productContext);
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
    const report = await generateReport(
      plan,
      personaResponses,
      summaryText,
      productContext
    );
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

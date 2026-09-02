import { runEntryAgent } from "./agents/entry";
import { generateReport, planSurvey, type PMPlan, type ReportData } from "./agents/pm";
import { askPersona, type PersonaResponse } from "./agents/persona";
import type { Persona } from "./agents/personas-data";
import { summarize, summaryToText, type SummaryData } from "./agents/summary";
import type { ChatMessage, StreamEvent } from "./agents/types";
import { getPersonas, pickRandomPersonas } from "./personas-store";

/** 每次調查從完整受訪者池隨機抽樣的人數（原本是全部 30 位）。 */
const SURVEY_SAMPLE_SIZE = 12;

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
  // Stage 級計時 — 找「訪談要等很久」卡在哪一段用。
  // 只印 log，不影響任何行為/輸出。
  const pipelineStart = Date.now();
  let stageStart = pipelineStart;
  const markStage = (label: string) => {
    const now = Date.now();
    // eslint-disable-next-line no-console
    console.log(
      `[timing] ${label}：${((now - stageStart) / 1000).toFixed(1)}s（累計 ${((now - pipelineStart) / 1000).toFixed(1)}s）`
    );
    stageStart = now;
  };

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
    markStage("1. entry 制定計畫");

    if (!entryResult || !entryResult.ready) {
      yield { type: "complete" };
      return;
    }

    // 每次調查從完整受訪者池隨機抽 SURVEY_SAMPLE_SIZE 位（原本是全部訪談），
    // 降低單次調查的訪談成本/時間，並讓每次調查看到不同的受訪者組合。
    const personas = pickRandomPersonas(getPersonas(), SURVEY_SAMPLE_SIZE);

    // 2. PM agent plans the survey (questions only — 抽樣出的受訪者都會被訪談)
    yield { type: "agent_start", agent: "pm", label: "規劃調查" };
    // 把原始 userMessage 一併送進去，讓 PM 在規劃問題時保留產品的原始規格
    // （年利率/月利率、額度、期限等數字），避免被「啟動者」摘要時失真。
    const plan = await planSurvey(history, entryResult.brief, userMessage, personas);
    yield {
      type: "agent_text",
      agent: "pm",
      label: "規劃調查",
      text: `**調查目標**：${plan.summary}\n\n**問題**：\n${plan.questions
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n")}\n\n**訪談對象**：隨機抽選 ${personas.length} 位受訪者並行訪談${
        plan.scopeNote ? `\n${plan.scopeNote}` : ""
      }`,
    };
    yield { type: "agent_done", agent: "pm", label: "規劃調查" };
    markStage("2. pm 規劃調查（planSurvey）");

    // 3. Persona agents — run all sampled personas in parallel.
    //    UI 端用 PersonaQAExplorer 一次顯示一題、3 位代表的答案，
    //    使用者可翻頁瀏覽下一題或換另外 3 位。
    const PAGE_SIZE = 3;
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

    // 把 userMessage（原始產品規格）+ plan.summary 一併傳給每位受訪者，
    // 讓他們答題時知道是針對「這個年利率 6.88% 的微貸方案」回答，
    // 而不是憑印象猜常識（過去曾出現「年利率 6.88%」答成「月利率 1.5%」的飄移）。
    const productContext = `${userMessage}\n\n調查目標：${plan.summary}`;

    // ---------- 漸進式訪談 ----------
    // 30 位受訪者並行訪談、每位完成時即時 yield 一個 persona_partial 給前端。
    // 真正的速率限制由 lib/anthropic.ts 的全域 semaphore 控制（LLM_MAX_CONCURRENCY），
    // 這裡的 fan-out 只是把所有 task 一次推下去、由 semaphore 排隊處理。
    //
    // pattern：把 task push 到 partials 陣列；consumer (此 generator) 用 promise
    // 等候 partials 增加 → drain → yield。partials 順序 = 完成順序（不必對齊 index）。
    type Done = { index: number; result: PersonaResponse };
    const partials: Done[] = [];
    let resolveNext: (() => void) | null = null;
    const notifyConsumer = () => {
      const fn = resolveNext;
      resolveNext = null;
      fn?.();
    };

    const fanout = personas.map((p, i) =>
      (async () => {
        try {
          const result = await askPersona(p, plan.questions, productContext);
          partials.push({ index: i, result });
        } catch (err) {
          // 個別受訪者失敗也要讓 consumer 進度推進；填空答案維持 index 對齊
          // eslint-disable-next-line no-console
          console.error(
            `[orchestrator] persona ${p.id} 失敗:`,
            err instanceof Error ? err.message : err
          );
          partials.push({
            index: i,
            result: {
              id: p.id,
              name: p.name,
              archetype: p.archetype,
              answers: new Array(plan.questions.length).fill(
                "（此受訪者暫時無回應）"
              ),
              text: "",
            },
          });
        }
        notifyConsumer();
      })()
    );

    const results: PersonaResponse[] = new Array(personas.length);
    let received = 0;
    while (received < personas.length) {
      if (partials.length === 0) {
        // 等下一位完成；JS 單執行緒，executor 同步執行，不會錯過 notify
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
      const done = partials.shift()!;
      received++;
      results[done.index] = done.result;
      yield {
        type: "persona_partial",
        questions: plan.questions,
        entry: {
          persona: personas[done.index],
          answers: done.result.answers,
        },
        completed: received,
        total: personas.length,
      };
    }

    // 所有 task 都已 settle（內部已 try/catch），await 只是收尾保險
    await Promise.all(fanout);
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
    markStage(`3. persona 訪談（${personas.length} 位並行）`);

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
    markStage("4. summary 彙總洞察（summarize）");
    const summaryText = summaryToText(summaryData);

    // 5. PM final report — structured JSON, bundled with all upstream data
    yield { type: "agent_start", agent: "pm", label: "回報結果" };
    const report = await generateReport(
      plan,
      personaResponses,
      summaryText,
      productContext
    );
    markStage("5. pm 回報結果（generateReport）");
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

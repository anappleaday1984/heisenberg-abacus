import { NextResponse } from "next/server";
import { generatePersonas } from "@/lib/agents/persona-generator";
import type { Persona } from "@/lib/agents/personas-data";
import { toTraditional } from "@/lib/agents/zh-convert";
import { getPersonas, savePersonas } from "@/lib/personas-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { prompt?: string };
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json(
      { error: "prompt 不能為空" },
      { status: 400 }
    );
  }

  try {
    const existing = getPersonas();
    const generated = await generatePersonas(prompt, existing);

    // Assign stable IDs + run all string fields through 簡→繁 converter
    const stamp = Date.now().toString(36);
    const newPersonas: Persona[] = generated.map((g, i) => ({
      id: `gen_${stamp}_${i + 1}`,
      archetype: toTraditional(g.archetype),
      name: toTraditional(g.name),
      gender: g.gender,
      age: g.age,
      yearlyIncomeTWD: g.yearlyIncomeTWD,
      incomeBreakdown: toTraditional(g.incomeBreakdown),
      personality: toTraditional(g.personality),
      family: toTraditional(g.family),
      assetsAndEvents: toTraditional(g.assetsAndEvents),
    }));

    // Auto-save merged set so chat agents see it immediately
    const merged = [...existing, ...newPersonas];
    savePersonas(merged);

    return NextResponse.json({
      ok: true,
      added: newPersonas.length,
      total: merged.length,
      newPersonas,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

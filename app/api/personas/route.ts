import { NextResponse } from "next/server";
import { getPersonas, savePersonas } from "@/lib/personas-store";
import type { Persona } from "@/lib/agents/personas-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPersonas());
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Persona[];

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "expected an array of personas" },
      { status: 400 }
    );
  }

  // Lightweight runtime validation
  for (const p of body) {
    if (
      typeof p.id !== "string" ||
      typeof p.archetype !== "string" ||
      typeof p.name !== "string" ||
      (p.gender !== "男" && p.gender !== "女") ||
      typeof p.age !== "number" ||
      typeof p.yearlyIncomeTWD !== "number" ||
      typeof p.incomeBreakdown !== "string" ||
      typeof p.personality !== "string" ||
      typeof p.family !== "string" ||
      typeof p.assetsAndEvents !== "string"
    ) {
      return NextResponse.json(
        { error: `invalid persona: ${JSON.stringify(p)}` },
        { status: 400 }
      );
    }
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const p of body) {
    if (ids.has(p.id)) {
      return NextResponse.json(
        { error: `duplicate id: ${p.id}` },
        { status: 400 }
      );
    }
    ids.add(p.id);
  }

  savePersonas(body);
  return NextResponse.json({ ok: true, count: body.length });
}

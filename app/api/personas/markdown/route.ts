import { getPersonas, personasToMarkdown } from "@/lib/personas-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const md = personasToMarkdown(getPersonas());
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="personas.md"',
    },
  });
}

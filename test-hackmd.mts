import { fetchPersonasFromHackmd } from "./lib/personas-store";

const personas = await fetchPersonasFromHackmd();
console.log(`✓ parsed ${personas.length} personas\n`);
for (const p of personas) {
  console.log(
    `  [${p.id}] ${p.archetype}：${p.name} | ${p.gender}/${p.age} | NT$${p.yearlyIncomeTWD.toLocaleString()}`
  );
  const missing = [];
  if (!p.personality) missing.push("personality");
  if (!p.family) missing.push("family");
  if (!p.assetsAndEvents) missing.push("assets");
  if (!p.age) missing.push("age");
  if (!p.yearlyIncomeTWD) missing.push("income");
  if (missing.length) console.log(`    ⚠ missing: ${missing.join(", ")}`);
}

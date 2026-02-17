import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

async function readJsonSafe(filePath: string): Promise<any> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET() {
  const repoRoot = path.resolve(process.cwd(), "../..");
  const outDir = path.join(repoRoot, "outputs", "demo");
  const inputPath = path.join(repoRoot, "inputs", "project.json");
  const decisionPath = path.join(outDir, "decision_results.json");
  const rulesPath = path.join(outDir, "rules_extraction.json");
  const colorsPath = path.join(repoRoot, "configs", "colors.json");

  const [projectInput, decisionResults, rulesExtraction, colors] = await Promise.all([
    readJsonSafe(inputPath),
    readJsonSafe(decisionPath),
    readJsonSafe(rulesPath),
    readJsonSafe(colorsPath)
  ]);

  return NextResponse.json({
    project_input: projectInput ?? {},
    decision_results: decisionResults ?? {},
    rules_extraction: rulesExtraction ?? {},
    artifact_base: "/api/artifact/outputs/demo",
    colors: colors ?? {}
  });
}


import { z } from "zod";

const severity = z.enum(["critical", "high", "medium", "low"]);
const findingSchema = z.strictObject({
  index: z.number().int().positive(),
  agent: z.string(),
  role: z.string(),
  severity,
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
  file: z.string(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  title: z.string(),
  rationale: z.string(),
  suggestedFix: z.string(),
  quotedCode: z.string(),
  quoteValid: z.boolean().nullable(),
});
const verdictSchema = z.strictObject({
  finding_idx: z.number().int().positive(),
  title_excerpt: z.string(),
  source_agent: z.string(),
  source_role: z.string(),
  verdict: z.enum(["VALID", "DUPLICATE", "FALSE_POSITIVE", "DOWNGRADE"]),
  duplicate_of: z.number().int().positive().nullable().optional(),
  new_severity: severity.optional(),
  rationale: z.string().trim().min(1),
});
const judgeSchema = z.strictObject({
  total_findings_parsed: z.number().int().nonnegative(),
  verdicts: z.array(verdictSchema),
  summary: z.strictObject({
    valid: z.number().int().nonnegative(),
    duplicate: z.number().int().nonnegative(),
    false_positive: z.number().int().nonnegative(),
    downgrade: z.number().int().nonnegative(),
    kept_findings_idx: z.array(z.number().int().positive()),
  }),
});
export const reviewInputSchema = z.strictObject({
  passes: z.array(z.strictObject({
    id: z.string().trim().min(1),
    agent: z.string().trim().min(1),
    role: z.string().trim().min(1),
    output: z.string().max(1_000_000).nullable(),
    error: z.string().nullable(),
  })).min(1).max(128),
  sources: z.array(z.strictObject({
    path: z.string().min(1),
    content: z.string().max(2_000_000),
  })).max(128).default([]),
  judge: z.string().max(2_000_000).nullable().default(null),
});
export const reviewOutputSchema = z.strictObject({
  state: z.enum(["unjudged", "judged", "degraded"]),
  complete: z.boolean(),
  roster: z.array(z.strictObject({
    id: z.string(), agent: z.string(), role: z.string(),
    outcome: z.enum(["succeeded", "failed", "malformed"]),
    error: z.string().nullable(),
  })),
  findings: z.array(findingSchema),
  kept: z.array(findingSchema),
  unionXml: z.string(),
  judgeError: z.string().nullable(),
});
type Finding = z.infer<typeof findingSchema>;
const severityOrder = ["critical", "high", "medium", "low"];
const attributes = (text: string) => Object.fromEntries(
  [...text.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
);
const xmlEscape = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const cdata = (text: string) => `<![CDATA[${text.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
function field(body: string, name: string) {
  const text = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(body)?.[1] ?? "";
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}
function parseFindings(output: string, agent: string, role: string): Finding[] {
  const blocks = [...output.matchAll(/<finding\b([^>]*)>([\s\S]*?)<\/finding>/gi)];
  const openings = [...output.matchAll(/<finding\b/gi)].length;
  if (openings !== blocks.length || (!blocks.length && !/<(?:findings|code-review-report)\b[^>]*\/>|<(?:findings|code-review-report)\b[^>]*>\s*<\/(?:findings|code-review-report)>/i.test(output))) {
    throw new Error("No valid finding list, or an incomplete finding element");
  }
  return blocks.map((block, i) => {
    const attrs = attributes(block[1]);
    const finding = findingSchema.parse({
      index: i + 1, agent, role, severity: attrs.severity, category: attrs.category,
      confidence: Number(attrs.confidence), file: attrs.file ?? "",
      lineStart: Number(attrs["line-start"]),
      lineEnd: Number(attrs["line-end"] ?? attrs["line-start"]),
      title: field(block[2], "title"), rationale: field(block[2], "rationale"),
      suggestedFix: field(block[2], "suggested-fix"), quotedCode: field(block[2], "quoted-code"),
      quoteValid: null,
    });
    if (!finding.file || !finding.title || !finding.rationale || finding.lineEnd < finding.lineStart) throw new Error("Finding has missing evidence or reversed line range");
    return finding;
  });
}
function unionXml(findings: Finding[]) {
  return `<code-review-report total="${findings.length}">\n${findings.map((f) =>
    `<finding index="${f.index}" source-agent="${xmlEscape(f.agent)}" source-role="${xmlEscape(f.role)}" severity="${f.severity}" category="${xmlEscape(f.category)}" confidence="${f.confidence}" file="${xmlEscape(f.file)}" line-start="${f.lineStart}" line-end="${f.lineEnd}"${f.quoteValid === null ? "" : ` quote-valid="${f.quoteValid}"`}>\n<title>${cdata(f.title)}</title>\n<rationale>${cdata(f.rationale)}</rationale>\n<suggested-fix>${cdata(f.suggestedFix)}</suggested-fix>\n<quoted-code>${cdata(f.quotedCode)}</quoted-code>\n</finding>`
  ).join("\n")}\n</code-review-report>`;
}
function judgeFindings(raw: string, findings: Finding[]) {
  const judge = judgeSchema.parse(JSON.parse(raw));
  const verdicts = new Map(judge.verdicts.map((v) => [v.finding_idx, v]));
  if (judge.total_findings_parsed !== findings.length || verdicts.size !== findings.length || judge.verdicts.length !== findings.length || findings.some((f) => !verdicts.has(f.index))) throw new Error("Judge must cover every union index exactly once");
  const counts = { valid: 0, duplicate: 0, false_positive: 0, downgrade: 0 };
  const kept: Finding[] = [];
  for (const finding of findings) {
    const verdict = verdicts.get(finding.index)!;
    if (verdict.source_agent !== finding.agent || verdict.source_role !== finding.role) throw new Error("Judge provenance mismatch");
    if (verdict.verdict === "DUPLICATE") {
      const canonical = verdict.duplicate_of ? verdicts.get(verdict.duplicate_of) : undefined;
      if (!canonical || canonical.verdict !== "VALID" || canonical.finding_idx >= finding.index) throw new Error("Duplicate must cite a prior VALID finding");
      counts.duplicate++;
    } else if (verdict.verdict === "DOWNGRADE") {
      if (!verdict.new_severity || severityOrder.indexOf(verdict.new_severity) <= severityOrder.indexOf(finding.severity)) throw new Error("DOWNGRADE must lower severity");
      counts.downgrade++;
      kept.push({ ...finding, severity: verdict.new_severity });
    } else if (verdict.verdict === "VALID") {
      counts.valid++;
      kept.push(finding);
    } else counts.false_positive++;
  }
  if (Object.entries(counts).some(([key, value]) => judge.summary[key as keyof typeof counts] !== value) || JSON.stringify(judge.summary.kept_findings_idx) !== JSON.stringify(kept.map((f) => f.index))) throw new Error("Judge summary disagrees with verdicts");
  return kept;
}
export function collectReview(input: z.infer<typeof reviewInputSchema>): z.infer<typeof reviewOutputSchema> {
  if (new Set(input.passes.map((p) => p.id)).size !== input.passes.length) throw new Error("Pass ids must be unique");
  if (new Set(input.sources.map((s) => s.path)).size !== input.sources.length) throw new Error("Source paths must be unique");
  const sources = new Map(input.sources.map((s) => [s.path, s.content.split(/\r?\n/)]));
  const findings: Finding[] = [];
  const roster = input.passes.map((pass) => {
    const identity = { id: pass.id, agent: pass.agent, role: pass.role };
    if (pass.error !== null || !pass.output?.trim()) return { ...identity, outcome: "failed" as const, error: pass.error ?? "Empty reviewer output" };
    try {
      findings.push(...parseFindings(pass.output, pass.agent, pass.role));
      return { ...identity, outcome: "succeeded" as const, error: null };
    } catch (error) {
      return { ...identity, outcome: "malformed" as const, error: String(error) };
    }
  });
  findings.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity) || b.confidence - a.confidence || a.file.localeCompare(b.file) || a.lineStart - b.lineStart);
  findings.forEach((finding, i) => {
    finding.index = i + 1;
    const lines = sources.get(finding.file);
    if (lines && finding.quotedCode) {
      const actual = normalize(lines.slice(finding.lineStart - 1, finding.lineEnd).join("\n"));
      finding.quoteValid = finding.lineEnd <= lines.length && actual.length > 0 && normalize(finding.quotedCode) === actual;
    }
  });
  const base = { complete: roster.every((p) => p.outcome === "succeeded"), roster, findings, unionXml: unionXml(findings) };
  if (input.judge === null) return { ...base, state: "unjudged", kept: findings, judgeError: null };
  try {
    return { ...base, state: "judged", kept: judgeFindings(input.judge, findings), judgeError: null };
  } catch (error) {
    return { ...base, state: "degraded", kept: findings, judgeError: String(error) };
  }
}

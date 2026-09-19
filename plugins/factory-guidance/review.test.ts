import { describe, expect, it } from "vitest";
import { collectReview, reviewInputSchema } from "./review.js";
const xml = '<findings><finding severity="high" category="correctness" confidence="0.9" file="src.ts" line-start="1" line-end="1"><title>Broken guard</title><rationale>False permits write</rationale><suggested-fix>Invert guard</suggested-fix><quoted-code><![CDATA[if (ready) write();]]></quoted-code></finding></findings>';
const pass = (id: string, output: string | null = xml) => ({ id, agent: id, role: "correctness", output, error: null });
function verdict(index: number, agent: string, kind = "VALID") {
  return { finding_idx: index, source_agent: agent, source_role: "correctness", title_excerpt: "Broken guard", verdict: kind, rationale: "Grounded in cited source" };
}
function judge(verdicts: (ReturnType<typeof verdict> & { duplicate_of?: number; new_severity?: string })[], summary = { valid: 1, duplicate: 0, false_positive: 0, downgrade: 0, kept_findings_idx: [1] }) {
  return JSON.stringify({ total_findings_parsed: verdicts.length, verdicts, summary });
}
describe("review collection", () => {
  it("retains identical findings with supplied roster attribution and reports partial roster", () => {
    const result = collectReview(reviewInputSchema.parse({ passes: [pass("a"), pass("b"), pass("c", null)] }));
    expect(result.findings.map(f => [f.index, f.agent])).toEqual([[1, "a"], [2, "b"]]);
    expect(result.complete).toBe(false);
    expect(result.roster[2].outcome).toBe("failed");
    expect(result.state).toBe("unjudged");
  });
  it("distinguishes explicit empty findings from empty and malformed responses", () => {
    const result = collectReview(reviewInputSchema.parse({ passes: [pass("a", "<findings></findings>"), pass("b", ""), pass("c", "<finding severity=\"high\">unfinished")] }));
    expect(result.roster.map(p => p.outcome)).toEqual(["succeeded", "failed", "malformed"]);
  });
  it("checks quotes only against explicit snapshots and rejects partial or wrong-range matches", () => {
    const input = { passes: [pass("a")], sources: [{ path: "src.ts", content: "if (ready) write();" }] };
    expect(collectReview(reviewInputSchema.parse(input)).findings[0].quoteValid).toBe(true);
    input.sources[0].content = "write();";
    expect(collectReview(reviewInputSchema.parse(input)).findings[0].quoteValid).toBe(false);
    expect(collectReview(reviewInputSchema.parse({ passes: [pass("a")] })).findings[0].quoteValid).toBeNull();
  });
  it("keeps raw findings when judge is malformed, missing indices, duplicated or inconsistent", () => {
    for (const raw of ["not json", judge([]), judge([verdict(1, "a"), verdict(1, "a")]), judge([verdict(1, "wrong")]), judge([verdict(1, "a")], { valid: 0, duplicate: 0, false_positive: 0, downgrade: 0, kept_findings_idx: [] })]) {
      const result = collectReview(reviewInputSchema.parse({ passes: [pass("a")], judge: raw }));
      expect(result.state).toBe("degraded");
      expect(result.kept).toEqual(result.findings);
      expect(result.judgeError).toBeTruthy();
    }
  });
  it("validates duplicates and applies real severity downgrades", () => {
    const raw = judge([verdict(1, "a"), { ...verdict(2, "b", "DUPLICATE"), duplicate_of: 1 }], { valid: 1, duplicate: 1, false_positive: 0, downgrade: 0, kept_findings_idx: [1] });
    const result = collectReview(reviewInputSchema.parse({ passes: [pass("a"), pass("b")], judge: raw }));
    expect(result.state).toBe("judged");
    expect(result.kept).toHaveLength(1);
    const downgraded = judge([{ ...verdict(1, "a", "DOWNGRADE"), new_severity: "low" }], { valid: 0, duplicate: 0, false_positive: 0, downgrade: 1, kept_findings_idx: [1] });
    expect(collectReview(reviewInputSchema.parse({ passes: [pass("a")], judge: downgraded })).kept[0].severity).toBe("low");
  });
  it("escapes source-controlled XML attributes and split CDATA", () => {
    const result = collectReview(reviewInputSchema.parse({ passes: [{ ...pass('a"<'), output: xml.replace("Broken guard", "<![CDATA[a]]]]><![CDATA[>b]]>") }] }));
    expect(result.unionXml).toContain('source-agent="a&quot;&lt;"');
    expect(result.findings[0].title).toBe("a]]>b");
    expect(result.unionXml).toContain("a]]]]><![CDATA[>b");
  });
});

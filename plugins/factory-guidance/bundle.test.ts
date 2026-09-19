import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "skills/pragmatic-orchestration");
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]);
}
describe("guidance bundle", () => {
  it("resolves every local markdown link and required detail asset", () => {
    for (const path of files(root).filter(path => path.endsWith(".md"))) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const target = match[1].split("#")[0];
        if (!target || /^[a-z]+:/.test(target)) continue;
        expect(existsSync(resolve(dirname(path), target)), `${path}: ${target}`).toBe(true);
      }
    }
    for (const name of ["factory", "review", "delegate", "runtime-contracts", "configuration", "session-history", "testing"]) expect(existsSync(join(root, "references", `${name}.md`))).toBe(true);
  });
  it("retains byte-identical source prompts and all eight role instructions", () => {
    const manifest: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "preserved-prompts.json"), "utf8"));
    for (const [name, hash] of Object.entries(manifest)) expect(createHash("sha256").update(readFileSync(join(root, "prompts", name))).digest("hex")).toBe(hash);
    const roles = readFileSync(join(root, "prompts/roles.txt"), "utf8");
    for (const role of ["ANALYST", "LATERAL", "SECURITY", "CORRECTNESS", "PERFORMANCE", "ARCHITECTURE", "CONSISTENCY", "AUDITOR"]) expect(roles.toUpperCase()).toContain(role);
  });
  it("does not revive a Porch runtime or hide external history gaps", () => {
    expect(files(root).some(path => /\.(?:py|sh)$/.test(path))).toBe(false);
    for (const path of files(root).filter(path => path.endsWith(".md") && !path.endsWith("session-history.md"))) expect(readFileSync(path, "utf8")).not.toMatch(/\$PORCH|porch (?:delegate|review|quota)/);
    expect(readFileSync(join(root, "references/session-history.md"), "utf8")).toMatch(/not shipped|not implemented|pending/i);
  });
});

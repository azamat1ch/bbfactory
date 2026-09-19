import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../skills/factory");
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(path, entry.name))
      : [join(path, entry.name)],
  );
}
describe("Factory skill bundle", () => {
  it("ships one operational skill with resolvable local links", () => {
    expect(
      files(resolve(root, "..")).filter((path) => path.endsWith("SKILL.md")),
    ).toEqual([join(root, "SKILL.md")]);
    expect(readFileSync(join(root, "SKILL.md"), "utf8")).toMatch(
      /^name: factory$/m,
    );
    for (const path of files(root).filter((path) => path.endsWith(".md"))) {
      for (const match of readFileSync(path, "utf8").matchAll(
        /\]\(([^)]+)\)/g,
      )) {
        const target = match[1].split("#")[0];
        if (!target || /^[a-z]+:/.test(target)) continue;
        expect(
          existsSync(resolve(dirname(path), target)),
          `${path}: ${target}`,
        ).toBe(true);
      }
    }
  });
  it("keeps developer history and retired tools outside operational guidance", () => {
    for (const path of files(root)) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(
        /bb_team_get|bb_usage_limits|bb_review_collect|bb_workflow_run|pragmatic-orchestration|\$PORCH/,
      );
    }
    expect(existsSync(resolve(__dirname, "skills"))).toBe(false);
    expect(existsSync(resolve(__dirname, "legacy-team-skill"))).toBe(false);
    expect(existsSync(resolve(__dirname, "LICENSE"))).toBe(true);
  });
});

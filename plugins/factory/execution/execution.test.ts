import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalRoot } from "./host.js";
import { executionGroups, rootsOverlap } from "./execution.js";

describe("native execution workspace ownership", () => {
  it("canonicalizes symlink aliases and groups ancestor roots without serializing distinct worktrees", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workflow-roots-"));
    try {
      await mkdir(join(directory, "checkout", "nested"), { recursive: true });
      await mkdir(join(directory, "worktree"));
      await symlink(join(directory, "checkout"), join(directory, "alias"));
      const checkout = await canonicalRoot(join(directory, "checkout"));
      const alias = await canonicalRoot(join(directory, "alias"));
      const nested = await canonicalRoot(join(directory, "checkout", "nested"));
      const worktree = await canonicalRoot(join(directory, "worktree"));
      expect(alias).toEqual(checkout);
      const groups = executionGroups({
        checkout: { hostId: "local", rootPath: checkout.path },
        alias: { hostId: "local", rootPath: alias.path },
        nested: { hostId: "local", rootPath: nested.path },
        worktree: { hostId: "local", rootPath: worktree.path },
        remote: { hostId: "remote", rootPath: checkout.path },
      });
      expect(groups.checkout).toBe(groups.alias);
      expect(groups.checkout).toBe(groups.nested);
      expect(groups.checkout).not.toBe(groups.worktree);
      expect(groups.checkout).not.toBe(groups.remote);
      expect(rootsOverlap("/repo", "/repository")).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

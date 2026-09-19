import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureWorkspaceState,
  stopCheckUnit,
  runDeclaredCheck,
} from "./host.js";

const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "factory-check-"));
  dirs.push(root);
  const project = join(root, "project");
  await exec("mkdir", [project]);
  await exec("git", ["init", "-q", project]);
  await writeFile(join(project, "check.py"), "print('check')\n");
  return { root, project };
}
const definition = (argv: string[], timeoutMs = 5000) => ({
  id: "check",
  requirementIds: ["R1"],
  testRef: "check.py",
  argv,
  timeoutMs,
  required: true,
});

describe("content capture", () => {
  it("canonicalizes aliases and hashes new files, modifications and deletions", async () => {
    const { root, project } = await workspace();
    const first = await captureWorkspaceState(project);
    expect(first.complete).toBe(true);
    await symlink(project, join(root, "alias"));
    expect(await captureWorkspaceState(join(root, "alias"))).toEqual(first);
    await writeFile(join(project, "new.ts"), "new behavior");
    const second = await captureWorkspaceState(project);
    expect(second.fingerprint).not.toBe(first.fingerprint);
    await writeFile(join(project, "new.ts"), "changed");
    const third = await captureWorkspaceState(project);
    expect(third.fingerprint).not.toBe(second.fingerprint);
    await exec("git", ["add", "new.ts"], { cwd: project });
    await rm(join(project, "new.ts"));
    expect((await captureWorkspaceState(project)).fingerprint).not.toBe(
      third.fingerprint,
    );
  });
  it("capture failures and outside symlinks remain incomplete", async () => {
    const { root, project } = await workspace();
    expect((await captureWorkspaceState(join(root, "absent"))).complete).toBe(
      false,
    );
    await symlink("/etc/hosts", join(project, "external"));
    expect((await captureWorkspaceState(project)).complete).toBe(false);
  });
});

describe("contained host checks", () => {
  it("never treats systemd missing-unit metadata as confirmed containment", async () => {
    await expect(stopCheckUnit("factory-does-not-exist-unit")).rejects.toThrow(
      "No loaded check containment identity",
    );
  });
  it("runs a real check, retains failure and prevents a detached descendant writing later", async () => {
    const { root, project } = await workspace();
    await writeFile(
      join(project, "check.py"),
      "import os,time\nif os.fork()==0:\n os.setsid()\n if os.fork()==0:\n  time.sleep(1)\n  open('escaped-write','w').write('bad')\n os._exit(0)\nprint('parent complete')\n",
    );
    const result = await runDeclaredCheck(
      { rootPath: project, check: definition(["python3", "check.py"]) },
      join(root, "logs"),
      new AbortController().signal,
    );
    expect(result.settled, result.output).toBe(true);
    expect(result.exitCode, result.output).toBe(0);
    expect(await readFile(result.logRef!, "utf8")).toContain("parent complete");
    await new Promise((resolve) => setTimeout(resolve, 1300));
    await expect(readFile(join(project, "escaped-write"))).rejects.toThrow();
    const failed = await runDeclaredCheck(
      {
        rootPath: project,
        check: definition(["python3", "-c", "raise SystemExit(7)"]),
      },
      join(root, "logs"),
      new AbortController().signal,
    );
    expect(failed.settled).toBe(true);
    expect(failed.exitCode).not.toBe(0);
  }, 15000);
  it("preserves the host PATH for an actual pnpm project check", async () => {
    const { root, project } = await workspace();
    await writeFile(join(project, "package.json"), "{}");
    await writeFile(
      join(project, "check.cjs"),
      "require('node:assert').equal(2+2,4); console.log('pnpm project assertion passed');",
    );
    const result = await runDeclaredCheck(
      {
        rootPath: project,
        check: {
          ...definition(["pnpm", "exec", "node", "check.cjs"]),
          testRef: "check.cjs",
        },
      },
      join(root, "logs"),
      new AbortController().signal,
    );
    expect(result.settled, result.detail ?? result.output).toBe(true);
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain("pnpm project assertion passed");
  }, 15000);
  it("times out and aborts without treating stop intent as a passing check", async () => {
    const { root, project } = await workspace();
    const controller = new AbortController();
    controller.abort();
    const result = await runDeclaredCheck(
      {
        rootPath: project,
        check: definition(
          ["python3", "-c", "import time; time.sleep(30)"],
          200,
        ),
      },
      join(root, "logs"),
      controller.signal,
    );
    expect(result.timedOut).toBe(true);
    expect(result.finishedAt - result.startedAt).toBeLessThan(10000);
    const timeout = await runDeclaredCheck(
      {
        rootPath: project,
        check: definition(
          ["python3", "-c", "import time; time.sleep(30)"],
          200,
        ),
      },
      join(root, "logs"),
      new AbortController().signal,
    );
    expect(timeout.timedOut).toBe(true);
    expect(timeout.exitCode).toBeNull();
  }, 15000);
  it("requires a real in-project test link before executing", async () => {
    const { root, project } = await workspace();
    await expect(
      runDeclaredCheck(
        {
          rootPath: project,
          check: { ...definition(["true"]), testRef: "missing.test.ts" },
        },
        join(root, "logs"),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
});

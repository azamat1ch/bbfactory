import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExperimentalHostRpcContext,
  ExperimentalHostWatchListener,
  ExperimentalHostWatchOptions,
} from "@get-bb/plugin-sdk/host";
import { afterEach, describe, expect, it } from "vitest";
import { createFactoryHostEntry } from "./host.js";
import type { factoryHostSignals } from "./shared.js";

type Signals = typeof factoryHostSignals;
type Context = ExperimentalHostRpcContext<Signals>;

function makeContext(
  dataDir: string,
  emitted: Array<{ signal: string; payload: unknown }>,
  watchListeners: Array<{
    options: ExperimentalHostWatchOptions;
    listener: ExperimentalHostWatchListener;
  }>,
): Context {
  return {
    signal: new AbortController().signal,
    lifecycle: { signal: new AbortController().signal },
    experimental_paths: { dataDir, tempDir: dataDir },
    experimental_emitSignal: async (signal, payload) => {
      emitted.push({ signal, payload });
    },
    experimental_watch: async (options, listener) => {
      watchListeners.push({ options, listener });
      return { dispose: async () => {} };
    },
    experimental_retainWorker: () => ({ dispose: async () => {} }),
  };
}

describe("factory host entry", () => {
  const dirs: string[] = [];
  async function workspace(): Promise<{ root: string; data: string }> {
    const root = await mkdtemp(join(tmpdir(), "bbfactory-ws-"));
    const data = await mkdtemp(join(tmpdir(), "bbfactory-data-"));
    dirs.push(root, data);
    return { root, data };
  }
  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  it("fingerprints workspace content including new files", async () => {
    const { root, data } = await workspace();
    const entry = createFactoryHostEntry();
    const context = makeContext(data, [], []);
    await writeFile(join(root, "a.txt"), "one\n");
    const first = await entry.handlers.captureState(
      { rootPath: root },
      context,
    );
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.fileCount).toBe(1);
    expect(first.isGitRepo).toBe(false);

    const again = await entry.handlers.captureState(
      { rootPath: root },
      context,
    );
    expect(again.fingerprint).toBe(first.fingerprint);

    await writeFile(join(root, "b.txt"), "two\n");
    const withNewFile = await entry.handlers.captureState(
      { rootPath: root },
      context,
    );
    expect(withNewFile.fingerprint).not.toBe(first.fingerprint);

    await writeFile(join(root, "a.txt"), "changed\n");
    const modified = await entry.handlers.captureState(
      { rootPath: root },
      context,
    );
    expect(modified.fingerprint).not.toBe(withNewFile.fingerprint);
  });

  it("captures the git head when the workspace is a repository", async () => {
    const { root, data } = await workspace();
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: root,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    await writeFile(join(root, "a.txt"), "one\n");
    execFileSync("git", ["add", "a.txt"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: root });
    const entry = createFactoryHostEntry();
    const context = makeContext(data, [], []);
    const state = await entry.handlers.captureState(
      { rootPath: root },
      context,
    );
    expect(state.isGitRepo).toBe(true);
    expect(state.head).toMatch(/^[0-9a-f]{40}$/);
  });

  it("captures tracked build files and executable mode changes", async () => {
    if (process.platform === "win32") return;
    const { root, data } = await workspace();
    execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(join(root, "build"));
    await writeFile(join(root, "build", "tool"), "#!/bin/sh\nexit 0\n");
    await writeFile(join(root, "env"), "config\n");
    execFileSync("git", ["add", "-f", "build/tool", "env"], { cwd: root });
    const entry = createFactoryHostEntry();
    const context = makeContext(data, [], []);
    const first = await entry.handlers.captureState({ rootPath: root }, context);
    expect(first.fileCount).toBe(2);
    expect(first.incomplete).toBe(false);

    await chmod(join(root, "build", "tool"), 0o755);
    const executable = await entry.handlers.captureState({ rootPath: root }, context);
    expect(executable.fingerprint).not.toBe(first.fingerprint);

    await writeFile(join(root, "build", "tool"), "#!/bin/sh\nexit 1\n");
    const changed = await entry.handlers.captureState({ rootPath: root }, context);
    expect(changed.fingerprint).not.toBe(executable.fingerprint);

    await writeFile(join(root, "build", "generated"), "ignored\n");
    const untrackedBuild = await entry.handlers.captureState({ rootPath: root }, context);
    expect(untrackedBuild.fingerprint).toBe(changed.fingerprint);

    await writeFile(join(root, "new-source.ts"), "export const n = 1\n");
    const untrackedSource = await entry.handlers.captureState({ rootPath: root }, context);
    expect(untrackedSource.fingerprint).not.toBe(untrackedBuild.fingerprint);
  });

  it("runs a declared check argv, records the log and exit code", async () => {
    const { root, data } = await workspace();
    const entry = createFactoryHostEntry();
    const context = makeContext(data, [], []);
    const result = await entry.handlers.runCheck(
      {
        rootPath: root,
        argv: [process.execPath, "-e", "process.stdout.write('hello-check')"],
        timeoutMs: 10_000,
        logFileName: "ev-1.log",
      },
      context,
    );
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.processTreeSettled).toBe(true);
    expect(result.outputTail).toContain("hello-check");
    expect(existsSync(result.logPath)).toBe(true);
    expect(readFileSync(result.logPath, "utf8")).toContain("hello-check");

    const failed = await entry.handlers.runCheck(
      {
        rootPath: root,
        argv: [process.execPath, "-e", "process.exit(3)"],
        timeoutMs: 10_000,
        logFileName: "ev-2.log",
      },
      context,
    );
    expect(failed.exitCode).toBe(3);
    expect(failed.timedOut).toBe(false);
  });

  it("kills a check that exceeds its timeout and reports timedOut", async () => {
    const { root, data } = await workspace();
    const entry = createFactoryHostEntry();
    const context = makeContext(data, [], []);
    const result = await entry.handlers.runCheck(
      {
        rootPath: root,
        argv: [process.execPath, "-e", "setTimeout(() => {}, 60_000)"],
        timeoutMs: 150,
        logFileName: "ev-3.log",
      },
      context,
    );
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(result.processTreeSettled).toBe(process.platform !== "win32");
  });

  it("kills descendants of a timed-out check on Unix", async () => {
    if (process.platform === "win32") return;
    const { root, data } = await workspace();
    const marker = join(root, "descendant-survived");
    const source = `const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 1200)`) }], { stdio: 'ignore' }); setTimeout(() => {}, 60000);`;
    const entry = createFactoryHostEntry();
    const result = await entry.handlers.runCheck(
      { rootPath: root, argv: [process.execPath, "-e", source], timeoutMs: 300, logFileName: "descendant.log" },
      makeContext(data, [], []),
    );
    expect(result.timedOut).toBe(true);
    expect(result.processTreeSettled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(existsSync(marker)).toBe(false);
  });

  it("fails closed when process tree settlement is unsupported", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    if (platform === undefined || !platform.configurable) return;
    const { root, data } = await workspace();
    try {
      Object.defineProperty(process, "platform", { ...platform, value: "win32" });
      const result = await createFactoryHostEntry().handlers.runCheck(
        { rootPath: root, argv: [process.execPath, "-e", "process.exit(0)"], timeoutMs: 10_000, logFileName: "unsupported.log" },
        makeContext(data, [], []),
      );
      expect(result.exitCode).toBe(0);
      expect(result.processTreeSettled).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("excludes dependency/build directories from the fingerprint", async () => {
    const { root, data } = await workspace();
    const entry = createFactoryHostEntry();
    const context = makeContext(data, [], []);
    await mkdir(join(root, "node_modules", "dep"), { recursive: true });
    await writeFile(join(root, "node_modules", "dep", "index.js"), "a\n");
    await writeFile(join(root, "src.ts"), "b\n");
    const first = await entry.handlers.captureState(
      { rootPath: root },
      context,
    );
    expect(first.fileCount).toBe(1);
    expect(first.incomplete).toBe(false);

    await writeFile(join(root, "node_modules", "dep", "index.js"), "b\n");
    const second = await entry.handlers.captureState(
      { rootPath: root },
      context,
    );
    expect(second.fingerprint).toBe(first.fingerprint);

    await writeFile(join(root, "new-source.ts"), "export const n = 1\n");
    const third = await entry.handlers.captureState(
      { rootPath: root },
      context,
    );
    expect(third.fingerprint).not.toBe(first.fingerprint);
    expect(third.fileCount).toBe(2);
  });

  it("fails closed when a file exceeds the hash limit", async () => {
    const { root, data } = await workspace();
    const entry = createFactoryHostEntry();
    const context = makeContext(data, [], []);
    const big = join(root, "huge.bin");
    const handle = await import("node:fs/promises").then((m) =>
      m.open(big, "w"),
    );
    await handle.truncate(65 * 1024 * 1024);
    await handle.close();
    const state = await entry.handlers.captureState(
      { rootPath: root },
      context,
    );
    expect(state.incomplete).toBe(true);
    expect(state.incompleteReasons[0]).toContain("huge.bin");
  });

  it("fails closed on unreadable files and directories", async () => {
    const { root, data } = await workspace();
    const entry = createFactoryHostEntry();
    const context = makeContext(data, [], []);
    const secretDir = join(root, "locked");
    await mkdir(secretDir);
    await writeFile(join(secretDir, "x.ts"), "x\n");
    const { chmod } = await import("node:fs/promises");
    await chmod(secretDir, 0o000);
    try {
      const state = await entry.handlers.captureState(
        { rootPath: root },
        context,
      );
      expect(state.incomplete).toBe(true);
      expect(state.incompleteReasons[0]).toContain("locked");
    } finally {
      await chmod(secretDir, 0o755);
    }
  });

  it("workspace watch emits workspaceChanged on filesystem events", async () => {
    const { root, data } = await workspace();
    const emitted: Array<{ signal: string; payload: unknown }> = [];
    const listeners: Array<{
      options: ExperimentalHostWatchOptions;
      listener: ExperimentalHostWatchListener;
    }> = [];
    const entry = createFactoryHostEntry();
    const context = makeContext(data, emitted, listeners);
    const armed = await entry.handlers.watchWorkspace(
      { key: "bft_1", rootPath: root, ignoredPaths: [".git/**"] },
      context,
    );
    expect(armed.watching).toBe(true);
    expect(listeners).toHaveLength(1);
    listeners[0]?.listener({ kind: "changed", changes: [] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(emitted).toEqual([
      {
        signal: "workspaceChanged",
        payload: { key: "bft_1" },
      },
    ]);
    await entry.handlers.unwatchWorkspace({ key: "bft_1" }, context);
  });
});

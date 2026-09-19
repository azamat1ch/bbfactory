import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readlink, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  experimental_defineHostEntry,
  experimental_sanitizeInheritedChildProcessEnv,
  experimental_spawnPortableOutputProcess,
  type ExperimentalHostWatchSubscription,
} from "@get-bb/plugin-sdk/host";
import { factoryHostContract, factoryHostSignals } from "./shared.js";

const MAX_FINGERPRINT_FILES = 50_000;
const MAX_FINGERPRINT_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_FINGERPRINT_FILE_BYTES = 64 * 1024 * 1024;
const GIT_TIMEOUT_MS = 15_000;
const CHECK_KILL_GRACE_MS = 2_000;
const PROCESS_TREE_SETTLE_MS = 10_000;
const LOG_TAIL_BYTES = 64 * 1024;
const MAX_LOG_BYTES = 8 * 1024 * 1024;
const MAX_INCOMPLETE_REASONS = 50;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "target",
  "__pycache__",
  ".pytest_cache",
  ".venv",
  "venv",
  "env",
]);

function relativeTo(rootPath: string, absolute: string): string {
  const rel = relative(rootPath, absolute);
  return rel === "" ? "." : rel.split(sep).join("/");
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; exitCode: number }> {
  const child = experimental_spawnPortableOutputProcess({
    command: "git",
    args,
    cwd,
    env: experimental_sanitizeInheritedChildProcessEnv({ env: process.env }),
  });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stderr.resume();
  const timer = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {}
  }, GIT_TIMEOUT_MS);
  try {
    const exitCode = await new Promise<number | null>((resolve) => {
      child.once("error", () => resolve(null));
      child.once("exit", (code) => resolve(code));
    });
    return { stdout: Buffer.concat(chunks).toString("utf8"), exitCode: exitCode ?? -1 };
  } finally {
    clearTimeout(timer);
  }
}

async function hashFileContent(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

interface CollectState {
  fileCount: number;
  totalBytes: number;
  incompleteReasons: string[];
}

function noteIncomplete(state: CollectState, reason: string): void {
  if (state.incompleteReasons.length < MAX_INCOMPLETE_REASONS) {
    state.incompleteReasons.push(reason);
  }
}

async function collectEntries(
  rootPath: string,
  state: CollectState,
  entries: Map<string, string>,
  trackedPaths: Set<string>,
): Promise<void> {
  const trackedDirectories = new Set<string>();
  for (const path of trackedPaths) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      trackedDirectories.add(parts.slice(0, index).join("/"));
    }
  }
  const pending: Array<{ directory: string; excluded: boolean }> = [
    { directory: rootPath, excluded: false },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const { directory, excluded } = current;
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      noteIncomplete(
        state,
        `unreadable directory ${relativeTo(rootPath, directory)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    for (const child of children) {
      const absolute = join(directory, child.name);
      const relativePath = relativeTo(rootPath, absolute);
      if (child.isDirectory()) {
        const childExcluded = excluded || SKIPPED_DIRECTORIES.has(child.name);
        if (!childExcluded || trackedDirectories.has(relativePath)) {
          pending.push({ directory: absolute, excluded: childExcluded });
        }
        continue;
      }
      if (excluded && !trackedPaths.has(relativePath)) continue;
      if (state.fileCount >= MAX_FINGERPRINT_FILES) {
        noteIncomplete(
          state,
          `file limit ${MAX_FINGERPRINT_FILES} exceeded at ${relativePath}`,
        );
        return;
      }
      state.fileCount += 1;
      try {
        if (child.isSymbolicLink()) {
          const target = await readlink(absolute);
          entries.set(relativePath, `symlink:${target}`);
          continue;
        }
        if (!child.isFile()) {
          entries.set(relativePath, "special");
          continue;
        }
        const info = await stat(absolute);
        state.totalBytes += info.size;
        if (state.totalBytes > MAX_FINGERPRINT_TOTAL_BYTES) {
          noteIncomplete(
            state,
            `byte limit ${MAX_FINGERPRINT_TOTAL_BYTES} exceeded at ${relativePath}`,
          );
          return;
        }
        if (info.size > MAX_FINGERPRINT_FILE_BYTES) {
          entries.set(relativePath, `oversize:${info.size}`);
          noteIncomplete(
            state,
            `file ${relativePath} is ${info.size} bytes; over the ${MAX_FINGERPRINT_FILE_BYTES}-byte hash limit`,
          );
          continue;
        }
        const contentHash = await hashFileContent(absolute);
        entries.set(relativePath, `${info.size}:${info.mode & 0o111}:${contentHash}`);
      } catch (error) {
        entries.set(relativePath, "unreadable");
        noteIncomplete(
          state,
          `unreadable file ${relativePath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}

async function captureWorkspaceState(rootPath: string): Promise<{
  isGitRepo: boolean;
  head: string | null;
  fingerprint: string;
  fileCount: number;
  incomplete: boolean;
  incompleteReasons: string[];
}> {
  const gitCheck = await runGit(rootPath, [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  const isGitRepo =
    gitCheck.exitCode === 0 && gitCheck.stdout.trim() === "true";
  let head: string | null = null;
  if (isGitRepo) {
    const headResult = await runGit(rootPath, ["rev-parse", "HEAD"]);
    head = headResult.exitCode === 0 ? headResult.stdout.trim() : null;
  }
  const state: CollectState = {
    fileCount: 0,
    totalBytes: 0,
    incompleteReasons: [],
  };
  const entries = new Map<string, string>();
  const trackedPaths = new Set<string>();
  if (isGitRepo) {
    const trackedResult = await runGit(rootPath, ["ls-files", "--cached", "-z"]);
    if (trackedResult.exitCode !== 0) {
      noteIncomplete(state, "unable to enumerate tracked files");
    } else {
      for (const path of trackedResult.stdout.split("\0")) {
        if (path) trackedPaths.add(path);
      }
    }
  }
  await collectEntries(rootPath, state, entries, trackedPaths);
  for (const path of trackedPaths) {
    if (!entries.has(path)) entries.set(path, "missing");
  }
  const hash = createHash("sha256");
  hash.update(`head:${head ?? "none"}\n`);
  for (const path of [...entries.keys()].sort()) {
    hash.update(`${path}\0${entries.get(path)}\n`);
  }
  return {
    isGitRepo,
    head,
    fingerprint: hash.digest("hex"),
    fileCount: state.fileCount,
    incomplete: state.incompleteReasons.length > 0,
    incompleteReasons: state.incompleteReasons,
  };
}

function sanitizeLogFileName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_.-]+/g, "_");
  return sanitized.length > 0 ? sanitized : "check.log";
}

async function processGroupSettled(
  pid: number | undefined,
  timeoutMs: number,
): Promise<boolean> {
  if (process.platform === "win32" || pid === undefined) return false;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(-pid, 0);
    } catch {
      return true;
    }
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function runDeclaredCheck(
  input: {
    rootPath: string;
    argv: string[];
    timeoutMs: number;
    logFileName: string;
  },
  dataDir: string,
  signal: AbortSignal,
): Promise<{
  exitCode: number | null;
  timedOut: boolean;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  logPath: string;
  outputTail: string;
  outputTruncated: boolean;
  processTreeSettled: boolean;
}> {
  const logsDir = join(dataDir, "check-logs");
  await mkdir(logsDir, { recursive: true });
  const logPath = join(logsDir, sanitizeLogFileName(input.logFileName));
  const logStream = createWriteStream(logPath, { flags: "w" });
  const startedAt = Date.now();
  let logBytes = 0;
  const tailChunks: Buffer[] = [];
  let tailBytes = 0;
  let outputTruncated = false;
  const record = (chunk: Buffer): void => {
    if (logBytes < MAX_LOG_BYTES) {
      const remaining = MAX_LOG_BYTES - logBytes;
      logStream.write(chunk.subarray(0, remaining));
      logBytes += Math.min(chunk.length, remaining);
      if (chunk.length > remaining) outputTruncated = true;
    } else {
      outputTruncated = true;
    }
    tailChunks.push(chunk);
    tailBytes += chunk.length;
    while (tailBytes > LOG_TAIL_BYTES && tailChunks.length > 0) {
      tailBytes -= tailChunks.shift()?.length ?? 0;
    }
  };
  const child = experimental_spawnPortableOutputProcess({
    command: input.argv[0] ?? "",
    args: input.argv.slice(1),
    cwd: input.rootPath,
    detached: process.platform !== "win32",
    env: experimental_sanitizeInheritedChildProcessEnv({ env: process.env }),
  });
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  let timedOut = false;
  let killTimer: NodeJS.Timeout | undefined;
  const kill = (signalName: NodeJS.Signals): void => {
    try {
      if (process.platform !== "win32" && child.pid !== undefined) {
        process.kill(-child.pid, signalName);
        return;
      }
    } catch {}
    try {
      child.kill(signalName);
    } catch {}
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    kill("SIGTERM");
    killTimer = setTimeout(() => kill("SIGKILL"), CHECK_KILL_GRACE_MS);
  }, input.timeoutMs);
  const abort = (): void => {
    timedOut = true;
    kill("SIGTERM");
    killTimer = setTimeout(() => kill("SIGKILL"), CHECK_KILL_GRACE_MS);
  };
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  try {
    const exitCode = await new Promise<number | null>((resolve) => {
      child.once("error", () => resolve(null));
      child.once("exit", (code) => resolve(code));
    });
    const processTreeSettled = await processGroupSettled(
      child.pid,
      PROCESS_TREE_SETTLE_MS,
    );
    const finishedAt = Date.now();
    const combined = Buffer.concat(tailChunks).toString("utf8");
    const outputTail =
      Buffer.byteLength(combined, "utf8") > LOG_TAIL_BYTES
        ? combined.slice(-LOG_TAIL_BYTES)
        : combined;
    return {
      exitCode,
      timedOut,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      logPath,
      outputTail,
      outputTruncated,
      processTreeSettled,
    };
  } finally {
    clearTimeout(timeout);
    if (killTimer !== undefined) clearTimeout(killTimer);
    signal.removeEventListener("abort", abort);
    await new Promise<void>((resolve) => logStream.end(resolve));
  }
}

export function createFactoryHostEntry() {
  const watchers = new Map<string, ExperimentalHostWatchSubscription>();
  const disposeWatch = async (key: string): Promise<void> => {
    const existing = watchers.get(key);
    if (existing === undefined) return;
    watchers.delete(key);
    await existing.dispose().catch(() => undefined);
  };
  return experimental_defineHostEntry({
    contract: factoryHostContract,
    experimental_signals: factoryHostSignals,
    handlers: {
      async captureState(input) {
        return captureWorkspaceState(input.rootPath);
      },
      async runCheck(input, context) {
        return runDeclaredCheck(
          input,
          context.experimental_paths.dataDir,
          context.signal,
        );
      },
      async watchWorkspace(input, context) {
        await disposeWatch(input.key);
        const subscription = await context.experimental_watch(
          {
            rootPath: input.rootPath,
            ignoredPaths: input.ignoredPaths ?? [],
            debounceMs: 300,
            maxWaitMs: 1500,
          },
          (event) => {
            if (event.kind === "watch-error") return;
            void context
              .experimental_emitSignal("workspaceChanged", { key: input.key })
              .catch(() => undefined);
          },
        );
        watchers.set(input.key, subscription);
        return { watching: true as const };
      },
      async unwatchWorkspace(input) {
        await disposeWatch(input.key);
        return { ok: true as const };
      },
    },
    dispose: async () => {
      for (const key of [...watchers.keys()]) await disposeWatch(key);
    },
  });
}

export default createFactoryHostEntry();

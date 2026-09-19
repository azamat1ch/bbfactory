import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  lstat,
  readFile,
  realpath,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import {
  experimental_defineHostEntry,
  experimental_sanitizeInheritedChildProcessEnv,
} from "@get-bb/plugin-sdk/host";
import { factoryHostContract, type FactoryContent } from "./shared.js";
import { z } from "zod";

const exec = promisify(execFile);
async function capture(rootPath: string): Promise<FactoryContent> {
  const canonicalPath = await realpath(rootPath);
  const files = await exec(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: canonicalPath, timeout: 15000, maxBuffer: 16 * 1024 * 1024 },
  );
  const paths = [...new Set(files.stdout.split("\0").filter(Boolean))].sort();
  if (paths.length > 100000)
    throw new Error("Workspace exceeds capture file limit");
  const hash = createHash("sha256");
  let bytes = 0;
  for (const path of paths) {
    const full = join(canonicalPath, path);
    const rel = relative(canonicalPath, full);
    if (rel.startsWith("..") || isAbsolute(rel))
      throw new Error("Workspace path escaped root");
    hash.update(path + "\0");
    let before;
    try {
      before = await lstat(full);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        hash.update("deleted\0");
        continue;
      }
      throw error;
    }
    if (before.isSymbolicLink())
      throw new Error(
        `Symlink content requires explicit capture support: ${path}`,
      );
    if (!before.isFile())
      throw new Error(`Unsupported workspace entry: ${path}`);
    bytes += before.size;
    if (bytes > 256 * 1024 * 1024)
      throw new Error("Workspace exceeds capture byte limit");
    const data = await readFile(full);
    const after = await lstat(full);
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ino !== after.ino
    )
      throw new Error(`File changed during capture: ${path}`);
    hash
      .update(String(before.mode) + "\0")
      .update(data)
      .update("\0");
  }
  return {
    canonicalPath,
    fingerprint: hash.digest("hex"),
    complete: true,
    detail: null,
  };
}
export async function captureWorkspaceState(
  rootPath: string,
): Promise<FactoryContent> {
  try {
    const first = await capture(rootPath);
    const second = await capture(rootPath);
    if (first.fingerprint !== second.fingerprint)
      throw new Error("Workspace changed during capture");
    return second;
  } catch (error) {
    return {
      canonicalPath: await realpath(rootPath).catch(() => rootPath),
      fingerprint: "unknown",
      complete: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
export async function stopCheckUnit(unit: string): Promise<boolean> {
  const state = await exec(
    "systemctl",
    ["--user", "show", unit, "--property=LoadState", "--property=ControlGroup"],
    { timeout: 15000 },
  );
  const group = state.stdout.match(/^ControlGroup=(\/[^\n]+)$/m)?.[1];
  if (!state.stdout.includes("LoadState=loaded\n") || !group)
    throw new Error("No loaded check containment identity");
  await exec("systemctl", ["--user", "stop", unit], { timeout: 15000 });
  try {
    const events = await readFile(
      join("/sys/fs/cgroup", group, "cgroup.events"),
      "utf8",
    );
    return /^populated 0$/m.test(events);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return true;
    throw error;
  }
}
export async function runDeclaredCheck(
  input: z.infer<typeof factoryHostContract.runCheck.input>,
  dataDir: string,
  signal: AbortSignal,
) {
  const startedAt = Date.now();
  const rootPath = await realpath(input.rootPath);
  const testPath = await realpath(
    join(rootPath, input.check.testRef.split("#")[0]),
  );
  const testRelative = relative(rootPath, testPath);
  if (
    testRelative.startsWith("..") ||
    isAbsolute(testRelative) ||
    !(await lstat(testPath)).isFile()
  )
    throw new Error("Check testRef must name an existing project test file");
  const tracked = await exec(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      testRelative,
    ],
    { cwd: rootPath, timeout: 15000 },
  );
  if (!tracked.stdout.split("\0").includes(testRelative))
    throw new Error("Check testRef must be part of captured project content");
  await mkdir(dataDir, { recursive: true });
  if (signal.aborted)
    return {
      exitCode: null,
      timedOut: true,
      settled: true,
      startedAt,
      finishedAt: Date.now(),
      logRef: null,
      output: "",
      detail: "Check cancelled before launch",
    };
  const unit = `bb-factory-${randomUUID()}`;
  const receiptPath = join(dataDir, `${unit}.json`);
  const configPath = join(dataDir, `${unit}.config.json`);
  await writeFile(
    configPath,
    JSON.stringify({
      argv: input.check.argv,
      receipt: receiptPath,
      env: experimental_sanitizeInheritedChildProcessEnv({ env: process.env }),
    }),
    { mode: 0o600, flag: "wx" },
  );
  const wrapper = `const {spawn}=require('node:child_process');const {writeFileSync,readFileSync,unlinkSync}=require('node:fs');const input=JSON.parse(readFileSync(process.argv[1],'utf8'));unlinkSync(process.argv[1]);setInterval(()=>{},1000);const child=spawn(input.argv[0],input.argv.slice(1),{stdio:'inherit',env:input.env});child.once('error',error=>writeFileSync(input.receipt,JSON.stringify({exitCode:null,error:error.message})));child.once('exit',code=>writeFileSync(input.receipt,JSON.stringify({exitCode:code,error:null})));`;
  let output = "";
  let timedOut = false;
  let truncated = false;
  const child = spawn(
    "systemd-run",
    [
      "--user",
      "--wait",
      "--pipe",
      `--unit=${unit}`,
      "--property=KillMode=control-group",
      "--property=TimeoutStopSec=5s",
      `--property=RuntimeMaxSec=${Math.ceil(input.check.timeoutMs / 1000) + 30}`,
      "--working-directory=" + rootPath,
      "--",
      process.execPath,
      "-e",
      wrapper,
      configPath,
    ],
    { cwd: rootPath, stdio: ["ignore", "pipe", "pipe"] },
  );
  const append = (chunk: Buffer) => {
    if (Buffer.byteLength(output) + chunk.length > 8 * 1024 * 1024)
      truncated = true;
    else output += chunk.toString();
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  let failure: string | null = null;
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => {
    finish = resolve;
  });
  child.once("error", (error) => {
    failure = error.message;
    finish();
  });
  child.once("close", () => finish());
  const result: {
    value: { exitCode: number | null; error: string | null } | null;
  } = { value: null };
  const poll = setInterval(() => {
    void readFile(receiptPath, "utf8")
      .then((value) => {
        const parsed = z
          .strictObject({
            exitCode: z.number().int().nullable(),
            error: z.string().nullable(),
          })
          .parse(JSON.parse(value));
        result.value = parsed;
        finish();
      })
      .catch(() => undefined);
  }, 25);
  const stop = () => {
    timedOut = true;
    finish();
  };
  const timer = setTimeout(stop, input.check.timeoutMs);
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  await ready;
  clearInterval(poll);
  clearTimeout(timer);
  signal.removeEventListener("abort", stop);
  let settled = false;
  try {
    settled = await stopCheckUnit(unit);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  child.kill("SIGKILL");
  await rm(configPath, { force: true });
  const logRef = join(dataDir, `${unit}.log`);
  await writeFile(logRef, output);
  const finishedAt = Date.now();
  const receipt = result.value;
  return {
    exitCode: receipt?.exitCode ?? null,
    timedOut,
    settled: settled && !truncated,
    startedAt,
    finishedAt,
    logRef,
    output: output.slice(-65536),
    detail:
      failure ??
      receipt?.error ??
      (truncated
        ? "Check log exceeded capture limit"
        : !settled
          ? "No confirmed systemd cgroup settlement; check remains unverified"
          : null),
  };
}
export default experimental_defineHostEntry({
  contract: factoryHostContract,
  handlers: {
    captureState: (input) => captureWorkspaceState(input.rootPath),
    runCheck: (input, context) =>
      runDeclaredCheck(
        input,
        context.experimental_paths.dataDir,
        context.signal,
      ),
  },
});

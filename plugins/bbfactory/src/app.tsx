import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { Skeleton } from "@bb/shared-ui/skeleton";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  definePluginApp,
  useBbNavigate,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  type PluginMessageDirectiveProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import {
  FACTORY_PANEL_ACTION_ID,
  FACTORY_TASKS_REALTIME_CHANNEL,
  type FactoryAttemptView,
  type FactoryEvidenceView,
  type FactoryTaskDetail,
  type FactoryTaskStatus,
  type FactoryTaskView,
  type factoryRpcContract,
} from "./shared.js";

const POLL_INTERVAL_MS = 1_500;

type DetailState =
  | { status: "loading" }
  | { status: "ready"; detail: FactoryTaskDetail; refreshError: string | null }
  | { status: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function taskIdFromAttributes(
  attributes: Readonly<Record<string, string>>,
): string | null {
  if (Object.keys(attributes).some((key) => key !== "task")) return null;
  const taskId = attributes.task;
  return typeof taskId === "string" && /^bft_[0-9a-f-]+$/i.test(taskId)
    ? taskId
    : null;
}

function taskIdFromParams(params: unknown): string | null {
  if (!isRecord(params)) return null;
  const value = params.taskId;
  return typeof value === "string" && /^bft_[0-9a-f-]+$/i.test(value)
    ? value
    : null;
}

function isTaskActive(status: FactoryTaskStatus): boolean {
  return (
    status === "running" ||
    status === "awaiting_checks" ||
    status === "cancelling"
  );
}

function statusLabel(status: FactoryTaskStatus): string {
  switch (status) {
    case "proposed":
      return "Proposed";
    case "running":
      return "Running";
    case "awaiting_checks":
      return "Verifying";
    case "accepted":
      return "Accepted";
    case "failed":
      return "Checks failed";
    case "blocked":
      return "Blocked";
    case "cancelling":
      return "Cancelling";
    case "cancelled":
      return "Cancelled";
  }
}

function statusTone(
  status: FactoryTaskStatus,
): "default" | "accent" | "success" | "danger" | "warning" {
  switch (status) {
    case "accepted":
      return "success";
    case "failed":
    case "blocked":
      return "danger";
    case "cancelling":
      return "warning";
    case "running":
    case "awaiting_checks":
      return "accent";
    default:
      return "default";
  }
}

const TONE_CLASS: Record<string, string> = {
  default: "border-border bg-background text-muted-foreground",
  accent: "border-accent/40 bg-accent/10 text-accent-foreground",
  success: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  danger: "border-destructive/30 bg-destructive/10 text-destructive-text",
  warning: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
};

function StatusPill({ status }: { status: FactoryTaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-2xs font-medium",
        TONE_CLASS[statusTone(status)],
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function evidenceTone(status: FactoryEvidenceView["status"]): string {
  switch (status) {
    case "passed":
      return TONE_CLASS.success;
    case "failed":
    case "error":
    case "incomplete":
      return TONE_CLASS.danger;
    case "running":
      return TONE_CLASS.accent;
    case "stale":
      return TONE_CLASS.warning;
  }
}

function evidenceLabel(status: FactoryEvidenceView["status"]): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "error":
      return "Error";
    case "running":
      return "Running";
    case "stale":
      return "Stale";
    case "incomplete":
      return "Incomplete";
  }
}

function attemptLabel(attempt: FactoryAttemptView): string {
  const target =
    attempt.intent === "direct"
      ? "direct"
      : (attempt.providerId ?? "provider");
  return `#${attempt.seq} ${target} · ${attempt.state}`;
}

function useFactoryTaskDetail(taskId: string | null): {
  state: DetailState;
  refresh: () => Promise<void>;
} {
  const rpc = useRpc<typeof factoryRpcContract>();
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    if (taskId === null) return;
    const ticket = ++sequence.current;
    try {
      const detail = await rpc.call("factoryGetTask", { taskId });
      if (ticket === sequence.current) {
        setState({ status: "ready", detail, refreshError: null });
      }
    } catch (error) {
      if (ticket === sequence.current) {
        const message = error instanceof Error ? error.message : String(error);
        setState((current) =>
          current.status === "ready"
            ? { ...current, refreshError: message }
            : { status: "error", message },
        );
      }
    }
  }, [rpc, taskId]);

  useEffect(() => {
    setState({ status: "loading" });
    void refresh();
    return () => {
      sequence.current += 1;
    };
  }, [refresh]);

  useRealtime(FACTORY_TASKS_REALTIME_CHANNEL, (payload) => {
    if (
      isRecord(payload) &&
      typeof payload.taskId === "string" &&
      payload.taskId === taskId
    ) {
      void refresh();
    }
  });

  const connection = useRealtimeConnectionState();
  const wasDisconnected = useRef(false);
  useEffect(() => {
    if (connection !== "connected") {
      wasDisconnected.current = true;
      return;
    }
    if (!wasDisconnected.current) return;
    wasDisconnected.current = false;
    void refresh();
  }, [connection, refresh]);

  const active =
    state.status === "ready" && isTaskActive(state.detail.task.status);
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [active, refresh]);

  return { state, refresh };
}

function EvidenceRow({ evidence }: { evidence: FactoryEvidenceView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left hover:bg-background/60"
      >
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-px text-2xs font-medium",
            evidenceTone(evidence.status),
          )}
        >
          {evidenceLabel(evidence.status)}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
          {evidence.checkArgv.join(" ")}
        </span>
        <span className="shrink-0 text-2xs tabular-nums text-subtle-foreground">
          {evidence.exitCode === null ? "—" : `exit ${evidence.exitCode}`}
        </span>
      </button>
      {open ? (
        <div className="px-2 pb-2 text-2xs text-muted-foreground">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-subtle-foreground">Check</dt>
            <dd>{evidence.checkId}</dd>
            <dt className="text-subtle-foreground">Spec</dt>
            <dd>v{evidence.specVersion}</dd>
            <dt className="text-subtle-foreground">Content</dt>
            <dd className="truncate font-mono">
              {evidence.contentFingerprint.slice(0, 16)}…
            </dd>
            <dt className="text-subtle-foreground">Duration</dt>
            <dd>
              {evidence.durationMs === null
                ? "—"
                : `${(evidence.durationMs / 1000).toFixed(1)}s`}
              {evidence.timedOut ? " (timed out)" : ""}
            </dd>
            <dt className="text-subtle-foreground">Log</dt>
            <dd className="break-all font-mono">{evidence.logRef ?? "—"}</dd>
            {evidence.detail === null ? null : (
              <>
                <dt className="text-subtle-foreground">Detail</dt>
                <dd>{evidence.detail}</dd>
              </>
            )}
          </dl>
          {evidence.outputTail === null || evidence.outputTail === "" ? null : (
            <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border/50 bg-background p-2 text-2xs whitespace-pre-wrap text-muted-foreground">
              {evidence.outputTail}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TaskDetailView({
  detail,
  threadId,
  refresh,
}: {
  detail: FactoryTaskDetail;
  threadId: string;
  refresh: () => Promise<void>;
}) {
  const rpc = useRpc<typeof factoryRpcContract>();
  const navigate = useBbNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { task, attempts, evidence } = detail;
  const active = attempts.find((attempt) => attempt.id === task.activeAttemptId);
  const workerThreadId = active?.workerThreadId ?? null;
  const workerIsExternal =
    workerThreadId !== null && workerThreadId !== task.originThreadId;

  const run = async (
    label: string,
    action: () => Promise<unknown>,
  ): Promise<void> => {
    setBusy(label);
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium break-words text-foreground">
              {task.goal}
            </h2>
            <p className="mt-1 text-2xs text-subtle-foreground">
              {task.id} · spec v{task.specVersion}
            </p>
          </div>
          <StatusPill status={task.status} />
        </div>
        {task.statusDetail === null ? null : (
          <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            {task.statusDetail}
          </div>
        )}
        {actionError === null ? null : (
          <div
            role="alert"
            className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive-text"
          >
            {actionError}
          </div>
        )}
        {task.scope.length > 0 ? (
          <p className="mt-3 text-xs whitespace-pre-wrap text-muted-foreground">
            {task.scope}
          </p>
        ) : null}
        {task.requirementIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {task.requirementIds.map((id) => (
              <span
                key={id}
                className="rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground"
              >
                {id}
              </span>
            ))}
          </div>
        ) : null}
        <div className="my-4 h-px bg-border-seam" />
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Attempts
        </h3>
        {attempts.length === 0 ? (
          <p className="text-xs text-subtle-foreground">No attempts yet.</p>
        ) : (
          <ul className="space-y-1">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {attemptLabel(attempt)}
                </span>
                {attempt.stateDetail === null ? null : (
                  <span
                    className="max-w-48 truncate text-2xs text-subtle-foreground"
                    title={attempt.stateDetail}
                  >
                    {attempt.stateDetail}
                  </span>
                )}
                {attempt.workerThreadId !== null &&
                attempt.workerThreadId !== task.originThreadId ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate.toThread(attempt.workerThreadId ?? "")
                    }
                    className="shrink-0 cursor-pointer text-2xs text-accent-foreground underline-offset-2 hover:underline"
                  >
                    worker
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="my-4 h-px bg-border-seam" />
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Verification evidence
        </h3>
        {evidence.length === 0 ? (
          <p className="text-xs text-subtle-foreground">
            No checks have run yet.
          </p>
        ) : (
          <div className="rounded-md border border-border/50">
            {evidence.map((row) => (
              <EvidenceRow key={row.id} evidence={row} />
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border-seam p-3">
        {task.status === "running" && active !== null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              void run("complete", () =>
                rpc.call("factoryCompleteAttempt", { taskId: task.id }),
              )
            }
          >
            {busy === "complete" ? "Marking…" : "Mark done & verify"}
          </Button>
        ) : null}
        {task.status === "failed" ||
        task.status === "blocked" ||
        task.status === "accepted" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              void run("verify", () =>
                rpc.call("factoryVerifyTask", { taskId: task.id }),
              )
            }
          >
            {busy === "verify" ? "Verifying…" : "Re-run checks"}
          </Button>
        ) : null}
        {workerIsExternal ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate.toThread(workerThreadId)}
          >
            Open worker
          </Button>
        ) : null}
        {isTaskActive(task.status) || task.status === "blocked" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive-text"
            disabled={busy !== null || task.status === "cancelling"}
            onClick={() =>
              void run("cancel", () =>
                rpc.call("factoryCancelTask", { taskId: task.id }),
              )
            }
          >
            {task.status === "cancelling" ? "Cancelling…" : "Cancel"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FactoryTaskDirective({
  attributes,
}: PluginMessageDirectiveProps) {
  const taskId = taskIdFromAttributes(attributes);
  const { state } = useFactoryTaskDetail(taskId);
  const navigate = useBbNavigate();
  if (taskId === null) {
    return (
      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        Invalid factory task directive.
      </div>
    );
  }
  const openPanel = () =>
    navigate.openThreadPanel({
      actionId: FACTORY_PANEL_ACTION_ID,
      title: "Factory task",
      params: { taskId },
    });
  if (state.status === "loading") {
    return (
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        Could not load task {taskId}: {state.message}
      </div>
    );
  }
  const { task, evidence } = state.detail;
  const passed = evidence.filter((row) => row.status === "passed").length;
  const failed = evidence.filter(
    (row) => row.status === "failed" || row.status === "error",
  ).length;
  return (
    <button
      type="button"
      onClick={openPanel}
      className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-background/70"
    >
      <Icon name="ListTodo" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-foreground">
          {task.goal}
        </span>
        <span className="block text-2xs text-subtle-foreground">
          {evidence.length === 0
            ? "No checks run"
            : `${passed} passed · ${failed} failed`}{" "}
          · spec v{task.specVersion}
        </span>
      </span>
      <StatusPill status={task.status} />
    </button>
  );
}

function FactoryTaskPanel({ threadId, params }: PluginThreadPanelProps) {
  const taskId = taskIdFromParams(params);
  const rpc = useRpc<typeof factoryRpcContract>();
  const navigate = useBbNavigate();
  const [tasks, setTasks] = useState<FactoryTaskView[] | null>(null);
  const { state, refresh } = useFactoryTaskDetail(taskId);

  const reloadList = useCallback(async () => {
    try {
      const result = await rpc.call("factoryListTasks", { threadId });
      setTasks(result.tasks);
    } catch {
      setTasks([]);
    }
  }, [rpc, threadId]);

  useEffect(() => {
    if (taskId === null) void reloadList();
  }, [taskId, reloadList]);

  useRealtime(FACTORY_TASKS_REALTIME_CHANNEL, (payload) => {
    if (
      taskId === null &&
      isRecord(payload) &&
      payload.threadId === threadId
    ) {
      void reloadList();
    }
  });

  if (taskId !== null) {
    if (state.status === "loading") {
      return (
        <div className="p-4">
          <Skeleton className="h-5 w-1/2" />
        </div>
      );
    }
    if (state.status === "error") {
      return (
        <div className="p-4 text-xs text-muted-foreground">{state.message}</div>
      );
    }
    return (
      <TaskDetailView
        detail={state.detail}
        threadId={threadId}
        refresh={refresh}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h2 className="text-sm font-medium text-foreground">Factory tasks</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tasks anchored to this thread. Worker completion is never acceptance —
          declared checks decide.
        </p>
        <div className="mt-3 space-y-1">
          {tasks === null ? (
            <Skeleton className="h-8 w-full" />
          ) : tasks.length === 0 ? (
            <p className="text-xs text-subtle-foreground">
              No tasks yet. Ask the lead to create one, or run
              `bb factory task create`.
            </p>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() =>
                  navigate.openThreadPanel({
                    actionId: FACTORY_PANEL_ACTION_ID,
                    title: "Factory task",
                    params: { taskId: task.id },
                  })
                }
                className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-left hover:bg-background/70"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {task.goal}
                </span>
                <StatusPill status={task.status} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.messageDirective({
    id: "factory-task",
    component: FactoryTaskDirective,
  });
  app.slots.threadPanelAction({
    id: FACTORY_PANEL_ACTION_ID,
    title: "Factory tasks",
    icon: "ListTodo",
    component: FactoryTaskPanel,
  });
});

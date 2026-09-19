import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import {
  definePluginApp,
  useBbNavigate,
  useComposer,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  type PluginAppBuilder,
  type PluginMessageDirectiveProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import {
  FACTORY_PANEL_ACTION_ID,
  FACTORY_TASK_DIRECTIVE_ID,
  FACTORY_TASKS_REALTIME_CHANNEL,
  type FactoryTaskView,
  type factoryRpcContract,
} from "./shared.js";
import { ErrorNotice, Status, message } from "./app-primitives.js";
import { TaskDetail } from "./app-task-detail.js";
import "./app.css";

type LoadState<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; value: T; error: string | null };
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function taskIdFromParams(params: unknown) {
  return record(params) &&
    typeof params.taskId === "string" &&
    params.taskId.trim()
    ? params.taskId
    : null;
}
function useFactoryRecord<T>(
  key: string | null,
  load: () => Promise<T>,
  matches: (payload: unknown) => boolean,
) {
  const [state, setState] = useState<LoadState<T>>({ kind: "loading" });
  const sequence = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    if (key === null) return;
    const ticket = ++sequence.current;
    try {
      const value = await load();
      if (ticket === sequence.current)
        setState({ kind: "ready", value, error: null });
    } catch (error) {
      if (ticket === sequence.current)
        setState((current) =>
          current.kind === "ready"
            ? { ...current, error: message(error) }
            : { kind: "error", message: message(error) },
        );
    }
  }, [key, load]);
  useEffect(() => {
    setState({ kind: "loading" });
    void refresh();
    return () => {
      sequence.current++;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh]);
  useRealtime(FACTORY_TASKS_REALTIME_CHANNEL, (payload) => {
    if (!matches(payload)) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 250);
  });
  const connection = useRealtimeConnectionState();
  const previousConnection = useRef(connection);
  useEffect(() => {
    if (
      connection === "connected" &&
      previousConnection.current !== "connected"
    )
      void refresh();
    previousConnection.current = connection;
  }, [connection, refresh]);
  const replace = useCallback((value: T) => {
    sequence.current++;
    setState({ kind: "ready", value, error: null });
  }, []);
  return { state, refresh, replace, connected: connection === "connected" };
}

function useTask(taskId: string | null) {
  const rpc = useRpc<typeof factoryRpcContract>();
  const load = useCallback(
    () => rpc.call("factoryGetTask", { taskId: taskId ?? "" }),
    [rpc, taskId],
  );
  return useFactoryRecord(
    taskId,
    load,
    (payload) => record(payload) && payload.taskId === taskId,
  );
}

function GoalCard({
  task,
  open,
  unavailable,
}: {
  task: FactoryTaskView;
  open: () => void;
  unavailable?: boolean;
}) {
  return (
    <button type="button" className="factory-goal" onClick={open}>
      <Icon name="ListTodo" className="factory-goal-icon size-4" />
      <span className="factory-goal-copy">
        <span className="factory-goal-title">{task.goal}</span>
        <span className="factory-meta">
          Spec v{task.specVersion} · {task.requirements.length}{" "}
          {task.requirements.length === 1 ? "requirement" : "requirements"}
          {task.archived
            ? " · Archived"
            : task.stopRequested
              ? " · Stop requested"
              : ""}
        </span>
      </span>
      {unavailable ? (
        <span className="factory-meta">Status unavailable</span>
      ) : (
        <Status value={task.status} />
      )}
      <Icon name="ChevronRight" className="size-3.5" />
    </button>
  );
}

function FactoryTaskDirective({ attributes }: PluginMessageDirectiveProps) {
  const taskId =
    typeof attributes.task === "string" && attributes.task.trim()
      ? attributes.task
      : null;
  const { state, refresh, connected } = useTask(taskId);
  const navigate = useBbNavigate();
  if (!taskId) return <p className="factory-note">Task reference missing.</p>;
  if (state.kind === "loading")
    return (
      <p className="factory-note" role="status">
        Loading task…
      </p>
    );
  if (state.kind === "error")
    return (
      <ErrorNotice
        text={`Task unavailable: ${state.message}`}
        retry={() => void refresh()}
      />
    );
  return (
    <div className="factory-card">
      <GoalCard
        task={state.value.task}
        unavailable={!connected || !!state.error}
        open={() =>
          navigate.openThreadPanel({
            actionId: FACTORY_PANEL_ACTION_ID,
            title: "Factory task",
            params: { taskId },
          })
        }
      />
      {state.error && (
        <ErrorNotice
          text={`Could not refresh: ${state.error}`}
          retry={() => void refresh()}
        />
      )}
    </div>
  );
}

function TaskRecord({ taskId }: { taskId: string }) {
  const { state, refresh, replace, connected } = useTask(taskId);
  if (state.kind === "loading")
    return (
      <p className="factory-note factory-pad" role="status">
        Loading task…
      </p>
    );
  if (state.kind === "error")
    return <ErrorNotice text={state.message} retry={() => void refresh()} />;
  return (
    <>
      <div>
        {state.error && (
          <ErrorNotice
            text={`Could not refresh: ${state.error}`}
            retry={() => void refresh()}
          />
        )}
      </div>
      <TaskDetail
        detail={state.value}
        replace={replace}
        unavailable={!connected || !!state.error}
      />
    </>
  );
}

function FactoryTaskPanel({ threadId, params }: PluginThreadPanelProps) {
  const taskId = taskIdFromParams(params);
  return (
    <div className="factory-panel">
      {taskId ? (
        <TaskRecord key={taskId} taskId={taskId} />
      ) : (
        <TaskList key={threadId} threadId={threadId} />
      )}
    </div>
  );
}

function TaskList({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof factoryRpcContract>();
  const navigate = useBbNavigate();
  const composer = useComposer();
  const load = useCallback(
    () => rpc.call("factoryListTasks", { threadId }),
    [rpc, threadId],
  );
  const { state, refresh, connected } = useFactoryRecord(
    threadId,
    load,
    (payload) => record(payload) && payload.threadId === threadId,
  );
  return (
    <div className="factory-list">
      <h2>Tasks</h2>
      {state.kind === "loading" ? (
        <p className="factory-note" role="status">
          Loading tasks…
        </p>
      ) : state.kind === "error" ? (
        <ErrorNotice
          text={`Could not load tasks: ${state.message}`}
          retry={() => void refresh()}
        />
      ) : (
        <>
          {state.error && (
            <ErrorNotice text={state.error} retry={() => void refresh()} />
          )}
          {state.value.tasks.length ? (
            state.value.tasks.map((task) => (
              <GoalCard
                key={task.id}
                task={task}
                unavailable={!connected || !!state.error}
                open={() =>
                  navigate.openThreadPanel({
                    actionId: FACTORY_PANEL_ACTION_ID,
                    title: "Factory task",
                    params: { taskId: task.id },
                  })
                }
              />
            ))
          ) : (
            <div className="factory-empty">
              <Icon name="ListTodo" className="size-5" />
              <h3>Start with the goal</h3>
              <p>
                Discuss the work with your lead. Agreed requirements and their
                checks will appear here.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => composer.focus()}
              >
                Back to chat
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function registerFactoryTaskUi(app: PluginAppBuilder) {
  app.slots.messageDirective({
    id: FACTORY_TASK_DIRECTIVE_ID,
    component: FactoryTaskDirective,
  });
  app.slots.threadPanelAction({
    id: FACTORY_PANEL_ACTION_ID,
    title: "Factory tasks",
    icon: "ListTodo",
    component: FactoryTaskPanel,
  });
}
export default definePluginApp(registerFactoryTaskUi);

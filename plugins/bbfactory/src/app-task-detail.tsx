import { useRef, useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { useBbNavigate, useComposer, useRpc } from "@get-bb/plugin-sdk/app";
import type { FactoryTaskDetail, factoryRpcContract } from "./shared.js";
import {
  ErrorNotice,
  Status,
  message,
  time,
  type RunAction,
} from "./app-primitives.js";
import { RequirementRow } from "./app-requirements.js";

type Finding = FactoryTaskDetail["findings"][number];

function FindingRow({
  finding,
  taskId,
  busy,
  run,
}: {
  finding: Finding;
  taskId: string;
  busy: boolean;
  run: RunAction;
}) {
  const rpc = useRpc<typeof factoryRpcContract>();
  const [resolution, setResolution] = useState("");
  return (
    <details
      className="factory-finding"
      open={finding.required && finding.resolution === null}
    >
      <summary>
        <span className="factory-grow factory-finding-title">
          {finding.evidence}
        </span>
        <span className="factory-meta">
          {finding.resolution
            ? "Resolved"
            : finding.required
              ? "Blocks acceptance"
              : "Open · optional"}
        </span>
      </summary>
      <div className="factory-inset">
        <p className="factory-meta">{finding.id}</p>
        <p className="factory-note">{finding.evidence}</p>
        {finding.requirementIds.length > 0 && (
          <p className="factory-meta">{finding.requirementIds.join(" · ")}</p>
        )}
        {finding.resolution ? (
          <p className="factory-note">
            <strong>Resolution</strong>
            <br />
            {finding.resolution}
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (resolution.trim())
                void run("resolve", () =>
                  rpc.call("factoryResolveFinding", {
                    taskId,
                    findingId: finding.id,
                    resolution: resolution.trim(),
                  }),
                );
            }}
          >
            <label className="factory-field">
              Resolution evidence
              <textarea
                rows={2}
                value={resolution}
                disabled={busy}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="What changed, and what verifies the fix?"
              />
            </label>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={busy || !resolution.trim()}
            >
              Resolve finding
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}

export function TaskDetail({
  detail,
  replace,
  unavailable,
}: {
  detail: FactoryTaskDetail;
  replace: (detail: FactoryTaskDetail) => void;
  unavailable: boolean;
}) {
  const rpc = useRpc<typeof factoryRpcContract>();
  const navigate = useBbNavigate();
  const composer = useComposer();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editDrafted, setEditDrafted] = useState(false);
  const actionRunning = useRef(false);
  const { task } = detail;
  const run: RunAction = async (label, action) => {
    if (actionRunning.current) return;
    actionRunning.current = true;
    setBusy(label);
    setError(null);
    try {
      replace(await action());
    } catch (cause) {
      setError(message(cause));
    } finally {
      actionRunning.current = false;
      setBusy(null);
    }
  };
  const blocked = detail.findings.filter(
    (finding) => finding.required && !finding.resolution,
  ).length;
  return (
    <div className="factory-detail">
      <div className="factory-detail-scroll">
        <header className="factory-detail-header">
          <span className="factory-meta">
            Spec v{task.specVersion}
            {task.archived ? " · Archived" : ""}
          </span>
          {unavailable || error ? (
            <span className="factory-meta">Status unavailable</span>
          ) : busy === "verify" ? (
            <span className="factory-meta">Checking current content…</span>
          ) : (
            <Status value={task.status} />
          )}
        </header>
        <h2>{task.goal}</h2>
        <p className="factory-status-detail">
          {unavailable
            ? "Connection unavailable. Displayed records may be out of date."
            : error
              ? "Action failed. Verify to refresh current acceptance."
              : task.statusDetail}
        </p>
        {task.stopRequested && (
          <p className="factory-note">
            Stop requested. Native assignment status below records the outcome.
          </p>
        )}
        {error && <ErrorNotice text={error} />}
        <p className="factory-scope">{task.scope}</p>
        <div className="factory-section-heading">
          <h3>Requirements</h3>
          <span className="factory-meta">{task.requirements.length}</span>
        </div>
        <div className="factory-group">
          {task.requirements.map((requirement) => (
            <RequirementRow
              key={`${task.specVersion}:${requirement.id}`}
              requirement={requirement}
              detail={detail}
              busy={busy !== null || unavailable}
              run={run}
            />
          ))}
        </div>
        <details className="factory-section" open={blocked > 0}>
          <summary>
            <h3>Review findings</h3>
            <span className="factory-meta">
              {blocked
                ? `${blocked} blocking`
                : detail.findings.length || "None recorded"}
            </span>
          </summary>
          <div className="factory-group">
            {detail.findings.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                taskId={task.id}
                busy={busy !== null || unavailable || task.archived}
                run={run}
              />
            ))}
            {!detail.findings.length && (
              <p className="factory-note">No review findings recorded.</p>
            )}
          </div>
        </details>
        <details
          className="factory-section"
          open={detail.assignments.length > 0}
        >
          <summary>
            <h3>Assignments</h3>
            <span className="factory-meta">
              {detail.assignments.length || "Direct work"}
            </span>
          </summary>
          {detail.assignments.length === 0 ? (
            <p className="factory-note">
              No delegated assignments. The same acceptance checks apply to
              direct work.
            </p>
          ) : (
            <div className="factory-group">
              {detail.assignments.map((assignment) => (
                <details className="factory-assignment" key={assignment.id}>
                  <summary>
                    <span className="factory-grow">
                      {assignment.title}
                      <span className="factory-meta factory-block">
                        {assignment.role} · {assignment.profile.model}
                      </span>
                    </span>
                    <span className="factory-meta">
                      {assignment.nativeStatus || "Status unknown"}
                    </span>
                  </summary>
                  <div className="factory-inset">
                    <p className="factory-note">{assignment.scope}</p>
                    <dl className="factory-properties">
                      <dt>Provider</dt>
                      <dd>
                        {assignment.profile.providerId} ·{" "}
                        {assignment.profile.reasoningLevel} ·{" "}
                        {assignment.profile.serviceTier}
                      </dd>
                      <dt>Environment</dt>
                      <dd>{assignment.environmentId}</dd>
                      <dt>Ownership</dt>
                      <dd>{assignment.ownership}</dd>
                      <dt>Access</dt>
                      <dd>{assignment.permissionMode}</dd>
                      <dt>Native run</dt>
                      <dd className="factory-mono">
                        {assignment.runId ?? "Not linked"}
                      </dd>
                      <dt>Preference</dt>
                      <dd>
                        Revision {assignment.preferenceRevision}
                        {assignment.overrideReason
                          ? ` · ${assignment.overrideReason}`
                          : ""}
                      </dd>
                    </dl>
                    {assignment.error && (
                      <p className="factory-error">{assignment.error}</p>
                    )}
                    {assignment.threadId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate.toThread(assignment.threadId!)}
                      >
                        Open native thread
                        <Icon name="ArrowUpRight" className="size-3" />
                      </Button>
                    ) : (
                      <p className="factory-note">
                        No native thread linked yet.
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </details>
        <details className="factory-section">
          <summary>
            <h3>Spec history</h3>
            <span className="factory-meta">v{task.specVersion}</span>
          </summary>
          <ol className="factory-history">
            {[...detail.specs]
              .sort((a, b) => b.version - a.version)
              .map((version) => (
                <li key={version.version}>
                  <details>
                    <summary>
                      <strong>v{version.version}</strong>
                      <span className="factory-grow">
                        {version.changeReason || "Initial specification"}
                      </span>
                    </summary>
                    <span className="factory-meta">
                      {time(version.createdAt)}
                    </span>
                    <p className="factory-note">{version.spec.goal}</p>
                    <p className="factory-note">{version.spec.scope}</p>
                    <ul>
                      {version.spec.requirements.map((requirement) => (
                        <li key={requirement.id}>
                          <strong>{requirement.id}</strong> {requirement.text}
                        </li>
                      ))}
                    </ul>
                    {version.spec.scenarios.map((scenario) => (
                      <dl className="factory-scenario" key={scenario.id}>
                        <dt>Given</dt>
                        <dd>{scenario.given}</dd>
                        <dt>When</dt>
                        <dd>{scenario.when}</dd>
                        <dt>Then</dt>
                        <dd>{scenario.then}</dd>
                      </dl>
                    ))}
                    {version.spec.checks.map((check) => (
                      <div className="factory-check" key={check.id}>
                        <div className="factory-check-heading">
                          <strong>{check.id}</strong>
                          <span className="factory-meta">
                            {check.required ? "Required" : "Optional"}
                          </span>
                        </div>
                        <p className="factory-meta">
                          {check.requirementIds.join(" · ")}
                        </p>
                        <p className="factory-mono">{check.testRef}</p>
                        <code className="factory-command">
                          {check.argv.join(" ")}
                        </code>
                      </div>
                    ))}
                  </details>
                </li>
              ))}
          </ol>
          {!detail.specs.length && (
            <p className="factory-note">Spec history unavailable.</p>
          )}
        </details>
      </div>
      <footer className="factory-footer">
        <div className="factory-actions">
          <Button
            type="button"
            size="sm"
            disabled={busy !== null || unavailable || task.archived}
            onClick={() =>
              void run("verify", () =>
                rpc.call("factoryVerifyTask", { taskId: task.id }),
              )
            }
          >
            {busy === "verify" ? "Verifying…" : "Verify current content"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              composer.addQuote(
                `Request edits to Factory task ${task.id}, spec v${task.specVersion}: ${task.goal}`,
              );
              setEditDrafted(true);
            }}
          >
            Request edits
          </Button>
          {!task.archived && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null || unavailable}
              onClick={() =>
                void run("stop", () =>
                  rpc.call("factoryCancelTask", {
                    taskId: task.id,
                    archive: false,
                  }),
                )
              }
            >
              {busy === "stop"
                ? "Stopping…"
                : task.stopRequested
                  ? "Retry stop"
                  : "Stop"}
            </Button>
          )}
        </div>
        {editDrafted && (
          <p role="status" className="factory-meta">
            Task reference added to chat. Describe your changes and send.
          </p>
        )}
      </footer>
    </div>
  );
}

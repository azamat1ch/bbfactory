import { useEffect, useRef, useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { useComposer, useRpc } from "@get-bb/plugin-sdk/app";
import type { FactoryTaskDetail, factoryRpcContract } from "./shared.js";
import {
  ArtifactList,
  ErrorNotice,
  Status,
  message,
  time,
  type RunAction,
} from "./app-primitives.js";
import { RequirementNavigator } from "./app-requirements.js";
import { HumanReviewPanel } from "./app-review.js";
import {
  currentFingerprint,
  requirementStatus,
  reviewMethods,
  specDelta,
} from "./app-status.js";

type Finding = FactoryTaskDetail["findings"][number];

function FindingRow({
  finding,
  taskId,
  busy,
}: {
  finding: Finding;
  taskId: string;
  busy: boolean;
}) {
  const composer = useComposer();
  const [drafted, setDrafted] = useState(false);
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
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                composer.addQuote(
                  `Discuss or resolve finding ${finding.id} for Factory task ${taskId}: ${finding.evidence}`,
                );
                setDrafted(true);
              }}
            >
              Discuss in chat
            </Button>
            {drafted && (
              <p className="factory-meta" role="status">
                Finding added to chat. Describe the resolution or feedback and
                send.
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function Notes({ detail }: { detail: FactoryTaskDetail }) {
  const notes = [...detail.notes].sort((a, b) => b.createdAt - a.createdAt);
  const kindLabel = {
    note: "Note",
    decision: "Decision",
    blocker: "Blocker",
    conclusion: "Conclusion",
  } as const;
  if (!notes.length) return null;
  return (
    <details className="factory-section">
      <summary>
        <h3>Notes &amp; artifacts</h3>
        <span className="factory-meta">{notes.length || "None"}</span>
      </summary>
      {notes.length === 0 ? (
        <p className="factory-note">No notes recorded.</p>
      ) : (
        <ul className="factory-notes">
          {notes.map((note) => (
            <li
              key={note.id}
              className={`factory-note-item factory-note-${note.kind}`}
            >
              <div className="factory-check-heading">
                <strong>{kindLabel[note.kind]}</strong>
                <span className="factory-meta">
                  v{note.specVersion}
                  {note.fingerprint
                    ? ` · ${note.fingerprint.slice(0, 12)}`
                    : ""}{" "}
                  · {time(note.createdAt)}
                </span>
              </div>
              <p className="factory-note">{note.text}</p>
              <ArtifactList
                refs={note.artifactRefs}
                environmentId={detail.task.environmentId}
              />
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function SpecHistory({ detail }: { detail: FactoryTaskDetail }) {
  const versions = [...detail.specs].sort((a, b) => b.version - a.version);
  return (
    <details className="factory-section">
      <summary>
        <h3>Spec history</h3>
        <span className="factory-meta">
          v{detail.task.specVersion} · {versions.length}{" "}
          {versions.length === 1 ? "version" : "versions"}
        </span>
      </summary>
      <ol className="factory-history">
        {versions.map((version, index) => {
          const previous = versions[index + 1]?.spec ?? null;
          return (
            <li key={version.version}>
              <details>
                <summary>
                  <strong>v{version.version}</strong>
                  <span className="factory-grow">
                    {version.changeReason || "Initial specification"}
                    <span className="factory-meta factory-block">
                      {specDelta(version.spec, previous)} ·{" "}
                      {time(version.createdAt)}
                    </span>
                  </span>
                </summary>
                <p className="factory-note">{version.spec.goal}</p>
                {version.spec.problem && (
                  <p className="factory-note">{version.spec.problem}</p>
                )}
                {version.spec.outcome && (
                  <p className="factory-note">{version.spec.outcome}</p>
                )}
                <ul>
                  {version.spec.requirements.map((requirement) => (
                    <li key={requirement.id}>
                      <strong>{requirement.id}</strong> {requirement.text}
                    </li>
                  ))}
                </ul>
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
          );
        })}
      </ol>
      {!versions.length && (
        <p className="factory-note">Spec history unavailable.</p>
      )}
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
  const composer = useComposer();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editDrafted, setEditDrafted] = useState(false);
  const [reviewDrafted, setReviewDrafted] = useState(false);
  const actionRunning = useRef<string | null>(null);
  const stopRunning = useRef(false);
  const actionSequence = useRef(0);
  const { task } = detail;
  const run: RunAction = async (label, action) => {
    if (label === "stop") {
      if (
        stopRunning.current ||
        (actionRunning.current !== null && actionRunning.current !== "verify")
      )
        return;
      stopRunning.current = true;
    } else if (actionRunning.current !== null || stopRunning.current) return;
    const sequence = ++actionSequence.current;
    actionRunning.current = label;
    setBusy(label);
    setError(null);
    try {
      const next = await action();
      if (sequence === actionSequence.current) replace(next);
    } catch (cause) {
      if (sequence === actionSequence.current) setError(message(cause));
    } finally {
      if (label === "stop") stopRunning.current = false;
      if (sequence === actionSequence.current) {
        actionRunning.current = null;
        setBusy(null);
      }
    }
  };
  const blocked = detail.findings.filter(
    (finding) => finding.required && !finding.resolution,
  ).length;
  const draft = task.phase === "draft";
  const active = task.phase === "active";
  const agentPending = task.requirements.filter(
    (requirement) =>
      reviewMethods(requirement).includes("agent") &&
      requirementStatus(requirement, detail) !== "accepted",
  );
  const fingerprint = currentFingerprint(detail);
  const identity = `${task.id}:${task.specVersion}:${fingerprint ?? "unknown"}`;
  const [selection, setSelection] = useState<{
    identity: string;
    ids: string[];
  }>({ identity, ids: [] });
  useEffect(() => {
    setSelection((previous) =>
      previous.identity === identity ? previous : { identity, ids: [] },
    );
  }, [identity]);
  const selected = selection.identity === identity ? selection.ids : [];
  const clearSelection = () => setSelection({ identity, ids: [] });
  const statusLine = unavailable
    ? "Live updates are unavailable. Records below may be out of date."
    : error
      ? "Action failed. Run checks to refresh current acceptance."
      : [
          task.statusDetail,
          active && fingerprint === null
            ? "Current result content is not fully captured; recorded statuses may not apply to the current result."
            : "",
        ]
          .filter(Boolean)
          .join(" ");
  return (
    <div className="factory-detail">
      <div className="factory-detail-scroll">
        <header className="factory-detail-header">
          <span className="factory-meta">
            Spec v{task.specVersion}
            {task.archived ? " · Archived" : ""}
          </span>
          {detail.deliveries.length > 0 ? (
            <span className="factory-status">Delivered</span>
          ) : unavailable || error ? null : busy === "verify" ||
            busy === "stop" ? (
            <span className="factory-meta">
              {busy === "stop" ? "Stopping…" : "Running checks…"}
            </span>
          ) : draft ? (
            <Status value="draft" />
          ) : null}
        </header>
        <h2>{task.goal}</h2>
        {detail.deliveries.length > 0 && (
          <section
            className="factory-delivery"
            aria-label="Historical delivery"
          >
            <details>
              <summary>
                Historical snapshots ({detail.deliveries.length})
              </summary>
              {detail.deliveries.map((delivery) => (
                <div className="factory-note" key={delivery.id}>
                  <p>
                    Spec v{delivery.specVersion} · {time(delivery.createdAt)}
                  </p>
                  <p className="factory-mono">{delivery.content.fingerprint}</p>
                  <p>Coverage at delivery: {delivery.verificationStatus}</p>
                  {delivery.mergeUrl && (
                    <ArtifactList
                      refs={[delivery.mergeUrl]}
                      environmentId={task.environmentId}
                    />
                  )}
                </div>
              ))}
            </details>
          </section>
        )}
        {error && <ErrorNotice text={error} />}
        {task.stopRequested && (
          <p className="factory-note">
            Execution stopped. Recorded evidence remains available.
          </p>
        )}
        {(task.problem || task.outcome) && (
          <div className="factory-brief">
            {task.problem && (
              <p>
                <span className="factory-brief-label">Problem</span>
                {task.problem}
              </p>
            )}
            {task.outcome && (
              <p>
                <span className="factory-brief-label">Outcome</span>
                {task.outcome}
              </p>
            )}
          </div>
        )}
        <section className="factory-scope-section" aria-label="Scope">
          <h3>Scope</h3>
          <p className="factory-scope">{task.scope}</p>
        </section>
        {draft && (
          <section className="factory-stage">
            <details className="factory-target-details">
              <summary>Target workspace</summary>
              <dl className="factory-properties">
                <dt>Project</dt>
                <dd>{task.projectId}</dd>
                <dt>Workspace</dt>
                <dd className="factory-mono">
                  {detail.observedContent?.canonicalPath ?? "Capture pending"}
                </dd>
                <dt>Target environment</dt>
                <dd className="factory-mono">{task.environmentId}</dd>
              </dl>
            </details>
            <div className="factory-actions">
              <Button
                type="button"
                size="sm"
                disabled={
                  busy !== null ||
                  unavailable ||
                  task.archived ||
                  task.stopRequested
                }
                onClick={() =>
                  void run("start", () =>
                    rpc.call("factoryStartTask", {
                      taskId: task.id,
                      expectedVersion: task.specVersion,
                    }),
                  )
                }
              >
                {busy === "start" ? "Starting…" : "Start task"}
              </Button>
            </div>
          </section>
        )}
        <div className="factory-section-heading">
          <h3>Requirements</h3>
          <span className="factory-meta">{task.requirements.length}</span>
        </div>
        {active && (
          <div className="factory-current-coverage">
            <div className="factory-check-heading">
              <span className="factory-meta">Current coverage</span>
              {!unavailable && !error && <Status value={task.status} />}
            </div>
            {statusLine && (
              <p className="factory-status-detail">{statusLine}</p>
            )}
          </div>
        )}
        <RequirementNavigator
          detail={detail}
          selected={selected}
          selectionDisabled={busy !== null || unavailable || !fingerprint}
          onSelectionChange={(ids) => setSelection({ identity, ids })}
        />
        <HumanReviewPanel
          key={`${task.specVersion}:${fingerprint ?? "unknown"}`}
          detail={detail}
          selected={selected}
          clearSelection={clearSelection}
          busy={busy !== null || unavailable}
          run={run}
        />
        {detail.findings.length > 0 && (
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
                />
              ))}
              {!detail.findings.length && (
                <p className="factory-note">No review findings recorded.</p>
              )}
            </div>
          </details>
        )}
        <Notes detail={detail} />
        {detail.approvals.length > 0 && (
          <details className="factory-section">
            <summary>
              <h3>Approval history</h3>
              <span className="factory-meta">{detail.approvals.length}</span>
            </summary>
            {detail.approvals.map((approval) => (
              <div className="factory-note" key={approval.id}>
                <strong>
                  {approval.accepted ? "Approved" : "Changes requested"} ·{" "}
                  {approval.scope === "delivery"
                    ? "Delivery"
                    : "Selected requirements"}{" "}
                  · v{approval.specVersion}
                </strong>
                <p>{approval.requirementIds.join(", ")}</p>
                {approval.rationale && <p>{approval.rationale}</p>}
                <span className="factory-meta">
                  {approval.actor} · {approval.source} ·{" "}
                  {time(approval.createdAt)}
                </span>
                {approval.sourceRef && (
                  <p className="factory-meta">{approval.sourceRef}</p>
                )}
              </div>
            ))}
          </details>
        )}
        <SpecHistory detail={detail} />
      </div>
      <footer className="factory-footer">
        <div className="factory-actions">
          {task.stopRequested && !task.archived && !task.executionRunning && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null || unavailable}
              onClick={() =>
                void run("resume", () =>
                  rpc.call("factoryResumeTask", {
                    taskId: task.id,
                    expectedVersion: task.specVersion,
                  }),
                )
              }
            >
              Resume task
            </Button>
          )}
          {active && !task.stopRequested && task.checks.length > 0 && (
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
              {busy === "verify" ? "Running checks…" : "Run checks"}
            </Button>
          )}
          {active &&
            !task.stopRequested &&
            agentPending.length > 0 &&
            !task.archived && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  composer.addQuote(
                    `Agent review requested for Factory task ${task.id} (spec v${task.specVersion}): ${agentPending
                      .map((requirement) => requirement.id)
                      .join(", ")}. Goal: ${task.goal}`,
                  );
                  setReviewDrafted(true);
                }}
              >
                Request agent review
              </Button>
            )}
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
          {!task.archived &&
            (task.executionRunning || busy === "verify" || busy === "stop") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={(busy !== null && busy !== "verify") || unavailable}
                onClick={() =>
                  void run("stop", () =>
                    rpc.call("factoryCancelTask", {
                      taskId: task.id,
                      archive: false,
                    }),
                  )
                }
              >
                {busy === "stop" ? "Stopping…" : "Cancel"}
              </Button>
            )}
        </div>
        {editDrafted && (
          <p role="status" className="factory-meta">
            Task reference added to chat. Describe your changes and send.
          </p>
        )}
        {reviewDrafted && (
          <p role="status" className="factory-meta">
            Review request added to chat. Send it to ask your lead for an agent
            review.
          </p>
        )}
      </footer>
    </div>
  );
}

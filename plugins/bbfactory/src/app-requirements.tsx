import { useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type {
  FactoryEvidence,
  FactoryTaskDetail,
  factoryRpcContract,
} from "./shared.js";
import { Status, time, type RunAction } from "./app-primitives.js";

type Requirement = FactoryTaskDetail["task"]["requirements"][number];

function Evidence({ evidence }: { evidence: FactoryEvidence }) {
  const { result } = evidence;
  return (
    <details className="factory-evidence">
      <summary>
        <Status value={evidence.outcome} />
        <span className="factory-meta">Recorded · v{evidence.specVersion}</span>
        <span className="factory-mono factory-grow">
          {time(result.finishedAt)}
        </span>
        <span className="factory-meta">
          {result.exitCode === null
            ? "No exit status"
            : `Exit ${result.exitCode}`}
        </span>
      </summary>
      <div className="factory-inset">
        <dl className="factory-properties">
          <dt>Spec</dt>
          <dd>v{evidence.specVersion}</dd>
          <dt>Command</dt>
          <dd className="factory-mono">
            {evidence.check.argv
              .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
              .join(" ")}
          </dd>
          <dt>Test</dt>
          <dd className="factory-mono">{evidence.check.testRef}</dd>
          <dt>Content</dt>
          <dd className="factory-mono">{evidence.content.fingerprint}</dd>
          <dt>Workspace</dt>
          <dd className="factory-mono">{evidence.content.canonicalPath}</dd>
          <dt>Capture</dt>
          <dd>
            {evidence.content.complete ? "Complete" : "Incomplete"}
            {evidence.content.detail ? ` · ${evidence.content.detail}` : ""}
          </dd>
          <dt>Environment</dt>
          <dd>
            {evidence.environmentId} · {evidence.hostId}
          </dd>
          <dt>Execution</dt>
          <dd>
            {result.settled ? "Settled" : "Settlement unknown"} ·{" "}
            {Math.max(0, (result.finishedAt - result.startedAt) / 1000).toFixed(
              1,
            )}
            s{result.timedOut ? " · Timed out" : ""}
          </dd>
          <dt>Log</dt>
          <dd className="factory-mono">
            {result.logRef ?? "No log reference"}
          </dd>
        </dl>
        {result.detail && <p className="factory-note">{result.detail}</p>}
        <pre className="factory-output">
          {result.output || "No output captured."}
        </pre>
      </div>
    </details>
  );
}

function HumanReview({
  requirement,
  detail,
  busy,
  run,
}: {
  requirement: Requirement;
  detail: FactoryTaskDetail;
  busy: boolean;
  run: RunAction;
}) {
  const rpc = useRpc<typeof factoryRpcContract>();
  const [rationale, setRationale] = useState("");
  const [confirmedIdentity, setConfirmedIdentity] = useState<string | null>(
    null,
  );
  const reviewIdentity = detail.observedContent?.complete
    ? `${detail.task.specVersion}:${detail.observedContent.fingerprint}:${detail.task.updatedAt}`
    : null;
  const confirmed =
    confirmedIdentity !== null && confirmedIdentity === reviewIdentity;
  const judgments = detail.judgments
    .filter((item) => item.requirementId === requirement.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="factory-human">
      {judgments.map((judgment) => (
        <div className="factory-note" key={judgment.id}>
          <strong>
            {judgment.accepted ? "Approval recorded" : "Rejected"} · spec v
            {judgment.specVersion}
          </strong>
          <p>{judgment.rationale}</p>
          <span className="factory-meta">
            {judgment.actor} · {time(judgment.createdAt)}
          </span>
        </div>
      ))}
      <p className="factory-meta">
        Human criterion. Record your judgment of the current result.
      </p>
      {detail.observedContent?.complete ? (
        <p className="factory-meta factory-mono">
          Content {detail.observedContent.fingerprint}
        </p>
      ) : (
        <p className="factory-note">
          Content identity unavailable. Refresh or verify before recording a
          judgment.
        </p>
      )}
      <label className="factory-field">
        Review notes
        <textarea
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="What did you inspect?"
          rows={2}
          disabled={busy}
        />
      </label>
      <label className="factory-attest">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) =>
            setConfirmedIdentity(event.target.checked ? reviewIdentity : null)
          }
          disabled={busy}
        />
        I personally reviewed this requirement.
      </label>
      <div className="factory-actions">
        {[true, false].map((accepted) => (
          <Button
            key={String(accepted)}
            type="button"
            size="sm"
            variant="outline"
            disabled={
              busy ||
              !confirmed ||
              !rationale.trim() ||
              detail.task.archived ||
              !detail.observedContent?.complete
            }
            onClick={() =>
              void run("judgment", async () => {
                if (!detail.observedContent?.complete)
                  throw new Error("Current content identity is unavailable.");
                const next = await rpc.call("factoryRecordJudgment", {
                  taskId: detail.task.id,
                  requirementId: requirement.id,
                  accepted,
                  actor: "User",
                  rationale: rationale.trim(),
                  humanConfirmed: true,
                  expectedVersion: detail.task.specVersion,
                  expectedFingerprint: detail.observedContent.fingerprint,
                });
                setConfirmedIdentity(null);
                setRationale("");
                return next;
              })
            }
          >
            {accepted ? "Accept requirement" : "Reject requirement"}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function RequirementRow({
  requirement,
  detail,
  busy,
  run,
}: {
  requirement: Requirement;
  detail: FactoryTaskDetail;
  busy: boolean;
  run: RunAction;
}) {
  const checks = detail.task.checks.filter((check) =>
    check.requirementIds.includes(requirement.id),
  );
  const scenarios = detail.task.scenarios.filter((scenario) =>
    scenario.requirementIds.includes(requirement.id),
  );
  return (
    <details className="factory-requirement">
      <summary>
        <span className="factory-requirement-id">{requirement.id}</span>
        <span className="factory-grow">{requirement.text}</span>
        <span className="factory-meta">
          {requirement.criterion === "human"
            ? "Human review"
            : checks.length
              ? `${checks.length} ${checks.length === 1 ? "check" : "checks"}`
              : "Unverified"}
        </span>
      </summary>
      <div className="factory-inset">
        {scenarios.map((scenario) => (
          <dl className="factory-scenario" key={scenario.id}>
            <dt>Given</dt>
            <dd>{scenario.given}</dd>
            <dt>When</dt>
            <dd>{scenario.when}</dd>
            <dt>Then</dt>
            <dd>{scenario.then}</dd>
          </dl>
        ))}
        {requirement.criterion === "automated" && checks.length === 0 && (
          <p className="factory-note">
            No check linked. This requirement remains unverified.
          </p>
        )}
        {checks.map((check) => {
          const evidence = detail.evidence
            .filter((item) => item.check.id === check.id)
            .sort((a, b) => b.result.finishedAt - a.result.finishedAt);
          return (
            <div className="factory-check" key={check.id}>
              <div className="factory-check-heading">
                <strong>{check.id}</strong>
                <span className="factory-meta">
                  {check.required ? "Required" : "Optional"}
                </span>
              </div>
              <div className="factory-mono factory-test-ref">
                {check.testRef}
              </div>
              <code className="factory-command">{check.argv.join(" ")}</code>
              {evidence.length > 0 && (
                <p className="factory-meta">
                  Recorded runs. Current acceptance is shown above.
                </p>
              )}
              {evidence.length ? (
                evidence.map((item) => (
                  <Evidence key={item.id} evidence={item} />
                ))
              ) : (
                <p className="factory-note">Not run · no evidence yet</p>
              )}
            </div>
          );
        })}
        {requirement.criterion === "human" && (
          <HumanReview
            requirement={requirement}
            detail={detail}
            busy={busy}
            run={run}
          />
        )}
      </div>
    </details>
  );
}

import { useMemo, useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import type { FactoryEvidence, FactoryTaskDetail } from "./shared.js";
import { ArtifactList, Status, time } from "./app-primitives.js";
import {
  findingBlocks,
  requirementRows,
  reviewMethodLabel,
  reviewMethods,
  statusCounts,
  type RequirementRow as Row,
  type RequirementStatus,
  type ReviewMethod,
} from "./app-status.js";

const PAGE_SIZE = 12;

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

function AgentReviews({
  requirementId,
  detail,
}: {
  requirementId: string;
  detail: FactoryTaskDetail;
}) {
  const reviews = detail.reviews
    .filter((review) => review.requirementIds.includes(requirementId))
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!reviews.length)
    return (
      <p className="factory-note">
        No agent review recorded yet for this requirement.
      </p>
    );
  return (
    <>
      {reviews.map((review) => (
        <div className="factory-review-record" key={review.id}>
          <div className="factory-check-heading">
            <strong>
              {review.accepted ? "Accepted" : "Changes requested"}
            </strong>
            <span className="factory-meta">
              {review.reviewer} · v{review.specVersion} ·{" "}
              {time(review.createdAt)}
            </span>
          </div>
          <p className="factory-note">{review.summary}</p>
          {review.limitations && (
            <p className="factory-meta">Limitations: {review.limitations}</p>
          )}
          <ArtifactList
            refs={review.artifactRefs}
            environmentId={detail.task.environmentId}
          />
        </div>
      ))}
    </>
  );
}

function HumanJudgments({
  requirementId,
  detail,
}: {
  requirementId: string;
  detail: FactoryTaskDetail;
}) {
  const judgments = detail.judgments
    .filter((item) => item.requirementId === requirementId)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!judgments.length) return null;
  return (
    <>
      {judgments.map((judgment) => (
        <div className="factory-note" key={judgment.id}>
          <strong>
            {judgment.accepted ? "Approval recorded" : "Changes requested"} ·
            spec v{judgment.specVersion}
          </strong>
          {judgment.rationale && <p>{judgment.rationale}</p>}
          <span className="factory-meta">
            {judgment.actor} · {time(judgment.createdAt)}
          </span>
        </div>
      ))}
    </>
  );
}

function RequirementDetail({
  row,
  detail,
}: {
  row: Row;
  detail: FactoryTaskDetail;
}) {
  const { requirement } = row;
  const checks = detail.task.checks.filter((check) =>
    check.requirementIds.includes(requirement.id),
  );
  const scenarios = detail.task.scenarios.filter((scenario) =>
    scenario.requirementIds.includes(requirement.id),
  );
  const blocked = findingBlocks(detail, requirement.id);
  return (
    <div className="factory-inset">
      {blocked && (
        <p className="factory-note">
          A required finding is unresolved and blocks acceptance.
        </p>
      )}
      {requirement.reviewInstructions && (
        <p className="factory-note">
          <strong>Review:</strong> {requirement.reviewInstructions}
        </p>
      )}
      <ArtifactList
        refs={requirement.artifactRefs}
        environmentId={detail.task.environmentId}
      />
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
      {reviewMethods(requirement).includes("check") && checks.length === 0 && (
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
            <div className="factory-mono factory-test-ref">{check.testRef}</div>
            <code className="factory-command">{check.argv.join(" ")}</code>
            {evidence.length ? (
              evidence.map((item) => <Evidence key={item.id} evidence={item} />)
            ) : (
              <p className="factory-note">Not run · no evidence yet</p>
            )}
          </div>
        );
      })}
      {reviewMethods(requirement).includes("agent") && (
        <AgentReviews requirementId={requirement.id} detail={detail} />
      )}
      {reviewMethods(requirement).includes("human") && (
        <HumanJudgments requirementId={requirement.id} detail={detail} />
      )}
    </div>
  );
}

export function RequirementNavigator({
  detail,
  selected,
  onSelectionChange,
  selectionDisabled,
}: {
  detail: FactoryTaskDetail;
  selected: string[];
  onSelectionChange: (ids: string[]) => void;
  selectionDisabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<"all" | ReviewMethod>("all");
  const [status, setStatus] = useState<"all" | RequirementStatus>("all");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => requirementRows(detail), [detail]);
  const counts = statusCounts(rows);
  const query = search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (method === "all" || reviewMethods(row.requirement).includes(method)) &&
      (status === "all" || row.status === status) &&
      (!query ||
        row.requirement.id.toLowerCase().includes(query) ||
        row.requirement.text.toLowerCase().includes(query)),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const showStatus = detail.task.phase === "active";
  const selectable =
    showStatus && !detail.task.archived && !detail.task.stopRequested;
  return (
    <div className="factory-nav">
      <div className="factory-progress" role="presentation">
        {(
          ["accepted", "failed", "stale", "unverified"] as RequirementStatus[]
        ).map((key) =>
          counts[key] ? (
            <span
              key={key}
              className={`factory-progress-seg factory-progress-${key}`}
              style={{ flexGrow: counts[key] }}
            />
          ) : null,
        )}
      </div>
      <p className="factory-meta factory-counts">
        {counts.accepted} accepted · {counts.failed} failed · {counts.stale}{" "}
        stale · {counts.unverified} unverified
      </p>
      <p className="factory-meta" aria-label="Acceptance by method">
        {(["check", "agent", "human"] as const)
          .map((method) => {
            const group = rows.filter((row) =>
              reviewMethods(row.requirement).includes(method),
            );
            return `${reviewMethodLabel(method)} ${group.filter((row) => row.status === "accepted").length}/${group.length}`;
          })
          .join(" · ")}{" "}
        accepted
      </p>
      {selectable && (
        <div className="factory-actions">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={selectionDisabled || selected.length === rows.length}
            onClick={() =>
              onSelectionChange(rows.map((row) => row.requirement.id))
            }
          >
            Select all ({rows.length})
          </Button>
          {selected.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={selectionDisabled}
              onClick={() => onSelectionChange([])}
            >
              Deselect all
            </Button>
          )}
        </div>
      )}
      <div className="factory-filters">
        <input
          type="search"
          className="factory-search"
          placeholder="Search requirements"
          aria-label="Search requirements"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Filter by method"
          className="factory-select"
          value={method}
          onChange={(event) => {
            setMethod(event.target.value as "all" | ReviewMethod);
            setPage(0);
          }}
        >
          <option value="all">All methods</option>
          <option value="check">Check</option>
          <option value="agent">Agent</option>
          <option value="human">Human</option>
        </select>
        <select
          aria-label="Filter by status"
          className="factory-select"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as "all" | RequirementStatus);
            setPage(0);
          }}
        >
          <option value="all">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="failed">Failed</option>
          <option value="stale">Stale</option>
          <option value="unverified">Unverified</option>
        </select>
      </div>
      <div className="factory-group factory-requirements-table">
        <div className="factory-requirements-heading" aria-hidden="true">
          <span />
          <span>ID</span>
          <span>Requirement</span>
          <span>Method</span>
          <span>{showStatus ? "Coverage" : ""}</span>
        </div>
        {slice.map((row) => (
          <div className="factory-requirement-row" key={row.requirement.id}>
            {selectable && (
              <input
                type="checkbox"
                className="factory-requirement-select"
                aria-label={`Select ${row.requirement.id}: ${row.requirement.text}`}
                checked={selected.includes(row.requirement.id)}
                disabled={selectionDisabled}
                onChange={(event) =>
                  onSelectionChange(
                    event.target.checked
                      ? [...selected, row.requirement.id]
                      : selected.filter((id) => id !== row.requirement.id),
                  )
                }
              />
            )}
            <details
              className="factory-requirement"
              key={row.requirement.id}
              open={expanded.has(row.requirement.id)}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setExpanded((previous) => {
                  if (previous.has(row.requirement.id) === open)
                    return previous;
                  const next = new Set(previous);
                  if (open) next.add(row.requirement.id);
                  else next.delete(row.requirement.id);
                  return next;
                });
              }}
            >
              <summary>
                <Icon
                  name="ChevronRight"
                  className="factory-requirement-toggle"
                  aria-hidden="true"
                />
                <span className="factory-requirement-id">
                  {row.requirement.id}
                </span>
                <span className="factory-requirement-text">
                  {row.requirement.text}
                </span>
                <span className="factory-method">
                  {reviewMethods(row.requirement)
                    .map(reviewMethodLabel)
                    .join(" + ")}
                </span>
                {showStatus && <Status value={row.status} />}
              </summary>
              <RequirementDetail row={row} detail={detail} />
            </details>
          </div>
        ))}
        {!slice.length && (
          <p className="factory-note factory-pad">
            No requirements match the current filters.
          </p>
        )}
      </div>
      {filtered.length > 0 && (
        <div className="factory-pagination">
          <span className="factory-meta">
            {current * PAGE_SIZE + 1}–
            {Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of{" "}
            {filtered.length}
          </span>
          {pageCount > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <Icon name="ChevronLeft" className="size-3.5" />
              Previous
            </Button>
          )}
          {pageCount > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
              <Icon name="ChevronRight" className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

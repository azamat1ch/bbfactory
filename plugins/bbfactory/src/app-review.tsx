import { useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { FactoryTaskDetail, factoryRpcContract } from "./shared.js";
import {
  ArtifactList,
  Status,
  time,
  type RunAction,
} from "./app-primitives.js";
import { currentFingerprint, requirementStatus } from "./app-status.js";

export function HumanReviewPanel({
  detail,
  busy,
  run,
}: {
  detail: FactoryTaskDetail;
  busy: boolean;
  run: RunAction;
}) {
  const rpc = useRpc<typeof factoryRpcContract>();
  const { task } = detail;
  const fingerprint = currentFingerprint(detail);
  const identity = `${task.specVersion}:${fingerprint ?? ""}`;
  const [selection, setSelection] = useState<{ key: string; ids: string[] }>({
    key: identity,
    ids: [],
  });
  const [notes, setNotes] = useState("");
  const human = task.requirements.filter(
    (requirement) => requirement.criterion === "human",
  );
  if (
    !human.length ||
    task.phase !== "active" ||
    task.archived ||
    task.stopRequested
  )
    return null;
  const pending = human.filter(
    (requirement) => requirementStatus(requirement, detail) !== "accepted",
  );
  const done = human.filter(
    (requirement) => requirementStatus(requirement, detail) === "accepted",
  );
  const pendingIds = new Set(pending.map((requirement) => requirement.id));
  const selected =
    selection.key === identity
      ? selection.ids.filter((id) => pendingIds.has(id))
      : [];
  const complete = fingerprint !== null;
  const toggle = (id: string, on: boolean) => {
    const base = selection.key === identity ? selection.ids : [];
    setSelection({
      key: identity,
      ids: on ? [...base, id] : base.filter((item) => item !== id),
    });
  };
  const judge = (accepted: boolean) =>
    run("judgment", async () => {
      if (!fingerprint)
        throw new Error("Current content identity is unavailable.");
      const next = await rpc.call("factoryRecordJudgments", {
        taskId: task.id,
        requirementIds: selected,
        accepted,
        actor: "User",
        rationale: notes.trim(),
        humanConfirmed: true,
        expectedVersion: task.specVersion,
        expectedFingerprint: fingerprint,
      });
      setSelection({ key: identity, ids: [] });
      setNotes("");
      return next;
    });
  return (
    <section className="factory-review">
      <div className="factory-section-heading">
        <h3>Human review</h3>
        <span className="factory-meta">
          {done.length} of {human.length} accepted
        </span>
      </div>
      {pending.length === 0 ? (
        <p className="factory-note">All human requirements are accepted.</p>
      ) : (
        <>
          <ul className="factory-review-list">
            {pending.map((requirement) => {
              const status = requirementStatus(requirement, detail);
              const latest = detail.judgments
                .filter((item) => item.requirementId === requirement.id)
                .at(-1);
              return (
                <li key={requirement.id} className="factory-review-item">
                  <label className="factory-review-row">
                    <input
                      type="checkbox"
                      disabled={!complete || busy}
                      checked={selected.includes(requirement.id)}
                      onChange={(event) =>
                        toggle(requirement.id, event.target.checked)
                      }
                    />
                    <span className="factory-requirement-id">
                      {requirement.id}
                    </span>
                    <span className="factory-grow">{requirement.text}</span>
                    <Status value={status} />
                  </label>
                  {requirement.reviewInstructions && (
                    <p className="factory-note">
                      {requirement.reviewInstructions}
                    </p>
                  )}
                  <ArtifactList refs={requirement.artifactRefs} />
                  {latest && !latest.accepted && (
                    <p className="factory-meta">
                      Last request: {latest.rationale}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <label className="factory-field">
            Review notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What you checked, or what needs to change"
              rows={2}
              disabled={busy}
            />
          </label>
          <div className="factory-actions">
            <Button
              type="button"
              size="sm"
              disabled={!selected.length || busy}
              onClick={() => void judge(true)}
            >
              {selected.length
                ? `Accept ${selected.length} selected`
                : "Accept selected"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selected.length || !notes.trim() || busy}
              onClick={() => void judge(false)}
            >
              Request changes
            </Button>
          </div>
          <p className="factory-meta">
            Accepting records your judgment on the current result. Requesting
            changes needs a note.
          </p>
        </>
      )}
      {done.length > 0 && (
        <details className="factory-review-done">
          <summary>
            <span className="factory-meta">
              Accepted ({done.length})
            </span>
          </summary>
          <ul className="factory-review-list">
            {done.map((requirement) => {
              const latest = detail.judgments
                .filter((item) => item.requirementId === requirement.id)
                .at(-1);
              return (
                <li key={requirement.id} className="factory-review-item">
                  <div className="factory-review-row">
                    <span className="factory-requirement-id">
                      {requirement.id}
                    </span>
                    <span className="factory-grow">{requirement.text}</span>
                    <Status value="accepted" />
                  </div>
                  {latest && (
                    <p className="factory-meta">
                      {latest.actor} · v{latest.specVersion} ·{" "}
                      {time(latest.createdAt)}
                      {latest.rationale ? ` · ${latest.rationale}` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

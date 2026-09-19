import { Button } from "@bb/shared-ui/button";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { FactoryTaskDetail, factoryRpcContract } from "./shared.js";
import { type RunAction } from "./app-primitives.js";
import { currentFingerprint } from "./app-status.js";

export function HumanReviewPanel({
  detail,
  busy,
  run,
  selected,
  clearSelection,
}: {
  detail: FactoryTaskDetail;
  busy: boolean;
  run: RunAction;
  selected: string[];
  clearSelection: () => void;
}) {
  const rpc = useRpc<typeof factoryRpcContract>();
  const { task } = detail;
  const fingerprint = currentFingerprint(detail);
  if (task.phase !== "active" || task.archived || task.stopRequested)
    return null;
  return (
    <section className="factory-review" aria-label="Approval">
      <p className="factory-meta" aria-live="polite">
        {selected.length
          ? `Selected requirements (${selected.length}): ${selected.join(", ")}`
          : `Delivery approval · all ${task.requirements.length} requirements · spec v${task.specVersion}`}
      </p>
      <div className="factory-actions">
        <Button
          type="button"
          size="sm"
          disabled={!fingerprint || busy}
          onClick={() =>
            void run("approval", async () => {
              if (!fingerprint)
                throw new Error("Current content identity is unavailable.");
              const next = await rpc.call("factoryApproveDelivery", {
                taskId: task.id,
                expectedVersion: task.specVersion,
                expectedFingerprint: fingerprint,
                scope: selected.length ? "selected" : "delivery",
                requirementIds: selected,
                accepted: true,
                actor: "User",
                humanConfirmed: true,
                source: "ui",
                sourceRef: null,
                rationale: "",
              });
              clearSelection();
              return next;
            })
          }
        >
          {selected.length ? "Approve selected" : "Approve"}
        </Button>
        {selected.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={clearSelection}
          >
            Clear selection
          </Button>
        )}
      </div>
    </section>
  );
}

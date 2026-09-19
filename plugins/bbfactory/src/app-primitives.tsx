import type { FactoryTaskDetail, FactoryTaskView } from "./shared.js";

export type RunAction = (
  label: string,
  action: () => Promise<FactoryTaskDetail>,
) => Promise<void>;

export function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
export function time(value: number) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function Status({
  value,
}: {
  value: FactoryTaskView["status"] | "passed";
}) {
  const labels = {
    accepted: "Accepted",
    failed: "Failed",
    unverified: "Unverified",
    stale: "Stale",
    passed: "Passed",
  };
  return (
    <span className={`factory-status factory-status-${value}`}>
      <span aria-hidden="true" />
      {labels[value]}
    </span>
  );
}

export function ErrorNotice({
  text,
  retry,
}: {
  text: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="factory-error">
      <span>{text}</span>
      {retry && (
        <button type="button" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}

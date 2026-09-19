import {
  experimental_FileLink as FileLink,
  UrlLink,
} from "@get-bb/plugin-sdk/app";
import type { FactoryTaskDetail, FactoryTaskView } from "./shared.js";
import { safeUrl } from "./app-status.js";

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

export type StatusValue = FactoryTaskView["status"] | "passed" | "draft";

export function Status({ value }: { value: StatusValue }) {
  const labels = {
    accepted: "Accepted",
    failed: "Failed",
    unverified: "Unverified",
    stale: "Stale",
    passed: "Passed",
    draft: "Draft",
  };
  return (
    <span className={`factory-status factory-status-${value}`}>
      <span aria-hidden="true" />
      {labels[value]}
    </span>
  );
}

export function ArtifactLink({
  value,
  environmentId,
}: {
  value: string;
  environmentId: string;
}) {
  const href = safeUrl(value);
  if (href)
    return (
      <UrlLink href={href} className="factory-artifact" target="_blank">
        {value}
      </UrlLink>
    );
  if (
    !value.startsWith("/") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
    (value.includes("/") || /\.[a-z0-9]+$/i.test(value))
  )
    return (
      <FileLink
        target={{
          kind: "workspace",
          environmentId,
          path: value.replace(/^\.\//, ""),
        }}
        className="factory-artifact"
      >
        {value}
      </FileLink>
    );
  return <span className="factory-mono factory-artifact">{value}</span>;
}

export function ArtifactList({
  refs,
  environmentId,
}: {
  refs: string[];
  environmentId: string;
}) {
  if (!refs.length) return null;
  return (
    <ul className="factory-artifacts">
      {refs.map((ref) => (
        <li key={ref}>
          <ArtifactLink value={ref} environmentId={environmentId} />
        </li>
      ))}
    </ul>
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

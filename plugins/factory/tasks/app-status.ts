import type { FactoryTaskDetail, FactorySpec } from "./shared.js";

export type Requirement = FactoryTaskDetail["task"]["requirements"][number];
export type RequirementStatus = "accepted" | "failed" | "stale" | "unverified";
export type ReviewMethod = "check" | "agent" | "human";

export function reviewMethods(requirement: Requirement): ReviewMethod[] {
  const methods = requirement.verificationMethods.length
    ? requirement.verificationMethods
    : [requirement.criterion];
  return methods.map((method) => (method === "automated" ? "check" : method));
}

export function reviewMethod(requirement: Requirement): ReviewMethod {
  return reviewMethods(requirement)[0]!;
}

export function reviewMethodLabel(method: ReviewMethod): string {
  return method === "check" ? "Check" : method === "agent" ? "Agent" : "Human";
}

export function currentFingerprint(detail: FactoryTaskDetail): string | null {
  const content = detail.observedContent;
  return content && content.complete ? content.fingerprint : null;
}

export function findingBlocks(
  detail: FactoryTaskDetail,
  requirementId: string,
): boolean {
  return detail.findings.some(
    (finding) =>
      finding.required &&
      finding.resolution === null &&
      (finding.requirementIds.length === 0 ||
        finding.requirementIds.includes(requirementId)),
  );
}

function recordCurrent(
  detail: FactoryTaskDetail,
  specVersion: number,
  fingerprint: string,
): boolean {
  const current = currentFingerprint(detail);
  return (
    specVersion === detail.task.specVersion &&
    current !== null &&
    fingerprint === current
  );
}

function evidenceCurrent(
  detail: FactoryTaskDetail,
  item: FactoryTaskDetail["evidence"][number],
): boolean {
  const observed = detail.observedContent;
  return (
    observed !== null &&
    observed.complete &&
    item.specVersion === detail.task.specVersion &&
    item.content.fingerprint === observed.fingerprint &&
    item.content.canonicalPath === observed.canonicalPath
  );
}

function methodStatus(
  requirement: Requirement,
  detail: FactoryTaskDetail,
  method: ReviewMethod,
): RequirementStatus {
  let status: RequirementStatus;
  if (findingBlocks(detail, requirement.id)) {
    status = "failed";
  } else if (method === "human") {
    const all = detail.judgments.filter(
      (item) => item.requirementId === requirement.id,
    );
    const latest = all
      .filter(
        (item) =>
          !detail.invalidatedEvidenceIds.includes(item.id) &&
          recordCurrent(detail, item.specVersion, item.fingerprint),
      )
      .at(-1);
    if (latest) status = latest.accepted ? "accepted" : "failed";
    else status = all.length ? "stale" : "unverified";
  } else if (method === "agent") {
    const all = detail.reviews.filter((item) =>
      item.requirementIds.includes(requirement.id),
    );
    const latest = all
      .filter(
        (item) =>
          !detail.invalidatedEvidenceIds.includes(item.id) &&
          recordCurrent(detail, item.specVersion, item.fingerprint),
      )
      .at(-1);
    if (latest) status = latest.accepted ? "accepted" : "failed";
    else status = all.length ? "stale" : "unverified";
  } else {
    const required = detail.task.checks.filter(
      (check) =>
        check.required && check.requirementIds.includes(requirement.id),
    );
    if (!required.length) {
      status = "unverified";
    } else {
      let missing = false;
      let stale = false;
      let failed = false;
      for (const check of required) {
        const runs = detail.evidence.filter(
          (item) => item.check.id === check.id,
        );
        const latest = runs
          .filter(
            (item) =>
              !detail.invalidatedEvidenceIds.includes(item.id) &&
              evidenceCurrent(detail, item),
          )
          .at(-1);
        if (!latest) {
          if (runs.length) stale = true;
          else missing = true;
          continue;
        }
        if (latest.outcome === "failed") failed = true;
        else if (latest.outcome !== "passed") missing = true;
      }
      status = failed
        ? "failed"
        : missing
          ? "unverified"
          : stale
            ? "stale"
            : "accepted";
    }
  }
  return status;
}

export function requirementStatus(
  requirement: Requirement,
  detail: FactoryTaskDetail,
): RequirementStatus {
  const statuses = reviewMethods(requirement).map((method) =>
    methodStatus(requirement, detail, method),
  );
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("unverified")) return "unverified";
  if (statuses.includes("stale")) return "stale";
  return "accepted";
}

export interface RequirementRow {
  requirement: Requirement;
  method: ReviewMethod;
  status: RequirementStatus;
}

export function requirementRows(detail: FactoryTaskDetail): RequirementRow[] {
  return detail.task.requirements.map((requirement) => ({
    requirement,
    method: reviewMethod(requirement),
    status: requirementStatus(requirement, detail),
  }));
}

export function statusCounts(
  rows: RequirementRow[],
): Record<RequirementStatus, number> {
  const counts: Record<RequirementStatus, number> = {
    accepted: 0,
    failed: 0,
    stale: 0,
    unverified: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export function safeUrl(ref: string): string | null {
  try {
    const url = new URL(ref);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export function specDelta(
  current: FactorySpec,
  previous: FactorySpec | null,
): string {
  if (!previous) return "Initial specification";
  const parts: string[] = [];
  const prevReqs = new Map(previous.requirements.map((r) => [r.id, r]));
  const nextReqs = new Map(current.requirements.map((r) => [r.id, r]));
  const addedReqs = current.requirements.filter(
    (r) => !prevReqs.has(r.id),
  ).length;
  const removedReqs = previous.requirements.filter(
    (r) => !nextReqs.has(r.id),
  ).length;
  const editedReqs = current.requirements.filter((r) => {
    const prev = prevReqs.get(r.id);
    return (
      prev &&
      (prev.text !== r.text ||
        prev.criterion !== r.criterion ||
        !sameStrings(prev.verificationMethods, r.verificationMethods) ||
        prev.reviewInstructions !== r.reviewInstructions ||
        !sameStrings(prev.artifactRefs, r.artifactRefs))
    );
  }).length;
  if (addedReqs) parts.push(`+${addedReqs} req`);
  if (removedReqs) parts.push(`−${removedReqs} req`);
  if (editedReqs) parts.push(`${editedReqs} req edited`);
  const prevChecks = new Map(previous.checks.map((c) => [c.id, c]));
  const nextChecks = new Map(current.checks.map((c) => [c.id, c]));
  const addedChecks = current.checks.filter(
    (c) => !prevChecks.has(c.id),
  ).length;
  const removedChecks = previous.checks.filter(
    (c) => !nextChecks.has(c.id),
  ).length;
  const editedChecks = current.checks.filter((c) => {
    const prev = prevChecks.get(c.id);
    return (
      prev &&
      (prev.testRef !== c.testRef ||
        prev.required !== c.required ||
        prev.timeoutMs !== c.timeoutMs ||
        !sameStrings(prev.argv, c.argv) ||
        !sameStrings(prev.requirementIds, c.requirementIds))
    );
  }).length;
  if (addedChecks)
    parts.push(`+${addedChecks} check${addedChecks === 1 ? "" : "s"}`);
  if (removedChecks)
    parts.push(`−${removedChecks} check${removedChecks === 1 ? "" : "s"}`);
  if (editedChecks)
    parts.push(`${editedChecks} check${editedChecks === 1 ? "" : "s"} edited`);
  const prevScenarios = new Map(previous.scenarios.map((s) => [s.id, s]));
  const nextScenarios = new Map(current.scenarios.map((s) => [s.id, s]));
  const addedScenarios = current.scenarios.filter(
    (s) => !prevScenarios.has(s.id),
  ).length;
  const removedScenarios = previous.scenarios.filter(
    (s) => !nextScenarios.has(s.id),
  ).length;
  const editedScenarios = current.scenarios.filter((s) => {
    const prev = prevScenarios.get(s.id);
    return (
      prev &&
      (prev.given !== s.given ||
        prev.when !== s.when ||
        prev.then !== s.then ||
        !sameStrings(prev.requirementIds, s.requirementIds))
    );
  }).length;
  if (addedScenarios)
    parts.push(`+${addedScenarios} scenario${addedScenarios === 1 ? "" : "s"}`);
  if (removedScenarios)
    parts.push(
      `−${removedScenarios} scenario${removedScenarios === 1 ? "" : "s"}`,
    );
  if (editedScenarios)
    parts.push(
      `${editedScenarios} scenario${editedScenarios === 1 ? "" : "s"} edited`,
    );
  const prevPlan = new Map(previous.teamPlan.map((p) => [p.id, p]));
  const nextPlan = new Map(current.teamPlan.map((p) => [p.id, p]));
  const addedPlan = current.teamPlan.filter((p) => !prevPlan.has(p.id)).length;
  const removedPlan = previous.teamPlan.filter(
    (p) => !nextPlan.has(p.id),
  ).length;
  const editedPlan = current.teamPlan.filter((p) => {
    const prev = prevPlan.get(p.id);
    return (
      prev &&
      (prev.title !== p.title ||
        prev.role !== p.role ||
        prev.rationale !== p.rationale ||
        prev.profile.providerId !== p.profile.providerId ||
        prev.profile.model !== p.profile.model ||
        prev.profile.reasoningLevel !== p.profile.reasoningLevel ||
        prev.profile.serviceTier !== p.profile.serviceTier ||
        !sameStrings(prev.requirementIds, p.requirementIds))
    );
  }).length;
  if (addedPlan) parts.push(`+${addedPlan} team`);
  if (removedPlan) parts.push(`−${removedPlan} team`);
  if (editedPlan) parts.push("team edited");
  if (
    current.goal !== previous.goal ||
    current.scope !== previous.scope ||
    current.problem !== previous.problem ||
    current.outcome !== previous.outcome
  )
    parts.push("brief edited");
  return parts.length ? parts.join(" · ") : "No structural change";
}

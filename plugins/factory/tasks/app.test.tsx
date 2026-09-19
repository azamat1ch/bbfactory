// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { FactoryTaskDetail } from "./shared.js";

const app = await loadPluginApp(() => import("./app.js"));
const panel = app.threadPanelActions[0]!;
const directive = app.messageDirectives[0]!;
afterEach(cleanup);

function fixture(): FactoryTaskDetail {
  const check = {
    id: "concurrent-bookings",
    requirementIds: ["BOOK-1"],
    testRef: "tests/bookings.test.ts:two simultaneous requests",
    argv: ["pnpm", "test", "bookings"],
    timeoutMs: 30000,
    required: true,
  };
  const spec = {
    problem: "Concurrent bookings can double-sell the last place.",
    outcome: "At most one booking wins; the loser sees a clear waitlist.",
    teamPlan: [],
    goal: "Keep the final place exclusive",
    scope: "Booking API and waitlist behavior.",
    requirements: [
      {
        id: "BOOK-1",
        text: "Exactly one concurrent booking succeeds",
        verificationMethods: [],
        criterion: "automated" as const,
        reviewInstructions: "",
        artifactRefs: [],
      },
      {
        id: "VISUAL",
        text: "The waitlist message is clear",
        verificationMethods: [],
        criterion: "human" as const,
        reviewInstructions: "Check the waitlist copy on mobile.",
        artifactRefs: ["https://example.com/waitlist.png", "docs/waitlist.md"],
      },
      {
        id: "COPY",
        text: "Confirmation email states the place",
        verificationMethods: [],
        criterion: "human" as const,
        reviewInstructions: "",
        artifactRefs: [],
      },
      {
        id: "AGENT-1",
        text: "Locking is race-free under retries",
        verificationMethods: [],
        criterion: "agent" as const,
        reviewInstructions: "Inspect the transaction boundaries.",
        artifactRefs: [],
      },
      {
        id: "UNMAPPED",
        text: "Cancellation restores availability",
        verificationMethods: [],
        criterion: "automated" as const,
        reviewInstructions: "",
        artifactRefs: [],
      },
    ],
    scenarios: [
      {
        id: "race",
        requirementIds: ["BOOK-1"],
        given: "one place remains",
        when: "two people book together",
        then: "one booking succeeds and one joins the waitlist",
      },
    ],
    checks: [check],
  };
  return {
    invalidatedEvidenceIds: [],
    approvals: [],
    deliveries: [],
    task: {
      executionRunning: false,
      ...spec,
      id: "task-1",
      projectId: "project-1",
      originThreadId: "lead-1",
      environmentId: "env-1",
      phase: "active",
      specVersion: 2,
      status: "stale",
      statusDetail: "Content changed since verification.",
      archived: false,
      stopRequested: false,
      createdAt: 1000,
      updatedAt: 4000,
    },
    evidence: [
      {
        id: "evidence-1",
        taskId: "task-1",
        specVersion: 1,
        check,
        content: {
          fingerprint: "old-content-sha",
          canonicalPath: "/project",
          complete: true,
          detail: null,
        },
        environmentId: "env-1",
        hostId: "host-1",
        outcome: "passed",
        result: {
          exitCode: 0,
          timedOut: false,
          settled: true,
          startedAt: 1000,
          finishedAt: 2000,
          logRef: "/logs/booking.log",
          output: "2 requests; 1 confirmed; 1 waitlisted",
          detail: null,
        },
      },
    ],
    findings: [
      {
        id: "review-1",
        taskId: "task-1",
        requirementIds: ["BOOK-1"],
        evidence: "Transaction does not lock the last place.",
        required: true,
        resolution: null,
        createdAt: 3000,
      },
    ],
    assignments: [
      {
        id: "assignment-1",
        launchId: "launch-1",
        role: "implement",
        prompt: "Fix the booking race",
        title: "Booking concurrency",
        profile: {
          providerId: "codex",
          model: "sol",
          reasoningLevel: "high",
          serviceTier: "default",
        },
        environmentId: "env-1",
        permissionMode: "accept-edits",
        scope: "Booking API",
        ownership: "exclusive",
        preferenceRevision: 3,
        overrideReason: null,
        hostId: "host-1",
        workspacePath: "/project",
        runId: "run-1",
        threadId: "worker-1",
        nativeStatus: "completed",
        result: null,
        error: null,
      },
    ],
    observedContent: {
      fingerprint: "current-content-sha",
      canonicalPath: "/project",
      complete: true,
      detail: null,
    },
    judgments: [],
    reviews: [],
    notes: [],
    specs: [
      {
        version: 1,
        spec,
        changeReason: "Initial specification",
        createdAt: 1000,
      },
      {
        version: 2,
        spec,
        changeReason: "Added cancellation behavior",
        createdAt: 4000,
      },
    ],
  };
}

function bulkFixture(count = 100): FactoryTaskDetail {
  const base = fixture();
  const requirements = Array.from({ length: count }, (_, i) => ({
    id: `R-${i + 1}`,
    text: `Requirement number ${i + 1} holds`,
    verificationMethods: [],
    criterion:
      i % 10 === 9
        ? ("human" as const)
        : i % 10 === 8
          ? ("agent" as const)
          : ("automated" as const),
    reviewInstructions: "",
    artifactRefs: [],
  }));
  const spec = {
    ...base.task,
    requirements,
    checks: [] as typeof base.task.checks,
    scenarios: [] as typeof base.task.scenarios,
    teamPlan: [] as typeof base.task.teamPlan,
  };
  return {
    ...base,
    task: {
      ...spec,
      statusDetail: "No checks recorded yet.",
      status: "unverified",
    },
    evidence: [],
    findings: [],
    judgments: [],
    reviews: [],
    notes: [],
    specs: [
      {
        version: 1,
        spec: {
          problem: spec.problem,
          outcome: spec.outcome,
          teamPlan: spec.teamPlan,
          goal: spec.goal,
          scope: spec.scope,
          requirements: spec.requirements,
          scenarios: spec.scenarios,
          checks: spec.checks,
        },
        changeReason: "Initial specification",
        createdAt: 1000,
      },
    ],
  };
}

function mount(
  detail = fixture(),
  handlers: Record<string, (input: unknown) => unknown> = {},
) {
  return renderSlot(
    panel,
    { threadId: "lead-1", params: { taskId: detail.task.id } },
    {
      composer: {
        scope: { kind: "thread", threadId: "lead-1" },
        text: "Keep this draft",
      },
      rpc: { factoryGetTask: () => detail, ...handlers },
    },
  );
}

function openSummary(slot: ReturnType<typeof renderSlot>, text: string) {
  const element = slot
    .getAllByText(text)
    .map((item) => item.closest("summary"))
    .find(Boolean);
  expect(element).toBeTruthy();
  fireEvent.click(element!);
}

describe("Factory task evidence", () => {
  it.each(["before", "after"])(
    "stops verification and ignores its accepted response arriving %s cancellation settles",
    async (completionOrder) => {
      const detail = fixture();
      let finishVerify!: (value: FactoryTaskDetail) => void;
      let finishStop!: (value: FactoryTaskDetail) => void;
      const verify = vi.fn(
        () =>
          new Promise<FactoryTaskDetail>((resolve) => {
            finishVerify = resolve;
          }),
      );
      const stop = vi.fn(
        () =>
          new Promise<FactoryTaskDetail>((resolve) => {
            finishStop = resolve;
          }),
      );
      const slot = mount(detail, {
        factoryVerifyTask: verify,
        factoryCancelTask: stop,
      });
      await slot.findByRole("heading", { name: detail.task.goal });
      fireEvent.click(slot.getByRole("button", { name: "Run checks" }));
      await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
      const stopButton = slot.getByRole("button", { name: "Cancel" });
      expect(stopButton.hasAttribute("disabled")).toBe(false);
      fireEvent.click(stopButton);
      fireEvent.click(stopButton);
      await waitFor(() =>
        expect(stop).toHaveBeenCalledExactlyOnceWith({
          taskId: "task-1",
          archive: false,
        }),
      );
      expect(
        slot
          .getByRole("button", { name: "Stopping…" })
          .hasAttribute("disabled"),
      ).toBe(true);
      expect(
        slot
          .getByRole("button", { name: "Run checks" })
          .hasAttribute("disabled"),
      ).toBe(true);
      if (completionOrder === "before") {
        await act(async () =>
          finishVerify({
            ...detail,
            task: {
              ...detail.task,
              status: "accepted",
              statusDetail: "All checks passed.",
            },
          }),
        );
        expect(
          slot
            .getByRole("button", { name: "Stopping…" })
            .hasAttribute("disabled"),
        ).toBe(true);
        expect(
          slot.queryByText("Accepted", { selector: ".factory-status" }),
        ).toBeNull();
      }
      await act(async () =>
        finishStop({
          ...detail,
          task: {
            ...detail.task,
            status: "unverified",
            stopRequested: true,
            statusDetail: "Verification stopped.",
          },
        }),
      );
      await slot.findByText("Verification stopped.");
      expect(
        slot.queryByText("Accepted", { selector: ".factory-status" }),
      ).toBeNull();
      if (completionOrder === "after") {
        await act(async () =>
          finishVerify({
            ...detail,
            task: {
              ...detail.task,
              status: "accepted",
              statusDetail: "All checks passed.",
            },
          }),
        );
      }
      expect(
        slot.queryByText("Accepted", { selector: ".factory-status" }),
      ).toBeNull();
      expect(slot.queryByText("All checks passed.")).toBeNull();
      expect(slot.getByText("Verification stopped.")).toBeTruthy();
      expect(slot.queryByRole("button", { name: "Run checks" })).toBeNull();
      expect(slot.getByRole("button", { name: "Resume task" })).toBeTruthy();
    },
  );

  it("keeps historical passes separate from current stale acceptance and exposes real check evidence", async () => {
    const slot = mount();
    await slot.findByRole("heading", {
      name: "Keep the final place exclusive",
    });
    expect(
      slot.getByText("Stale", { selector: ".factory-status" }),
    ).toBeTruthy();
    expect(
      slot.queryByText("Accepted", { selector: ".factory-status" }),
    ).toBeNull();
    expect(
      slot.getByText("0 accepted · 1 failed · 0 stale · 4 unverified"),
    ).toBeTruthy();
    openSummary(slot, "Exactly one concurrent booking succeeds");
    expect(slot.getAllByText("one place remains")[0]).toBeTruthy();
    expect(
      slot.getAllByText("tests/bookings.test.ts:two simultaneous requests")[0],
    ).toBeTruthy();
    expect(slot.getByText("Recorded · v1")).toBeTruthy();
    openSummary(slot, "Recorded · v1");
    expect(slot.getByText("old-content-sha")).toBeTruthy();
    expect(
      slot.getByText("2 requests; 1 confirmed; 1 waitlisted"),
    ).toBeTruthy();
    openSummary(slot, "Cancellation restores availability");
    expect(
      slot.getByText("No check linked. This requirement remains unverified."),
    ).toBeTruthy();
    expect(slot.getByText("1 blocking")).toBeTruthy();
    openSummary(slot, "Spec history");
    expect(slot.getByText("Added cancellation behavior")).toBeTruthy();
  });

  it("does not turn a current-path mismatch into green", async () => {
    const detail = fixture();
    detail.findings = [];
    detail.evidence = [
      {
        ...detail.evidence[0]!,
        specVersion: 2,
        content: {
          fingerprint: "current-content-sha",
          canonicalPath: "/elsewhere",
          complete: true,
          detail: null,
        },
      },
    ];
    const slot = mount(detail);
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(
      slot.getByText("0 accepted · 0 failed · 1 stale · 4 unverified"),
    ).toBeTruthy();
    expect(
      slot.queryByText("Accepted", { selector: ".factory-status" }),
    ).toBeNull();
  });

  it("marks a passing current check accepted without any human form", async () => {
    const detail = fixture();
    detail.findings = [];
    detail.evidence = [
      {
        ...detail.evidence[0]!,
        specVersion: 2,
        content: {
          fingerprint: "current-content-sha",
          canonicalPath: "/project",
          complete: true,
          detail: null,
        },
      },
    ];
    const slot = mount(detail);
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(
      slot.getByText("1 accepted · 0 failed · 0 stale · 4 unverified"),
    ).toBeTruthy();
  });

  it("preserves matching evidence after cancellation and never revives invalidated evidence", async () => {
    let detail = fixture();
    detail.findings = [];
    detail.task.stopRequested = true;
    detail.evidence[0] = {
      ...detail.evidence[0]!,
      specVersion: 2,
      content: detail.observedContent!,
    };
    const slot = mount(detail, { factoryGetTask: () => detail });
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(
      slot.getByText("1 accepted · 0 failed · 0 stale · 4 unverified"),
    ).toBeTruthy();
    detail = { ...detail, invalidatedEvidenceIds: [detail.evidence[0]!.id] };
    await slot.emitRealtime("factory-tasks", { taskId: detail.task.id });
    await slot.findByText("0 accepted · 0 failed · 1 stale · 4 unverified");
  });

  it("requires every configured method and exposes combined-method filters", async () => {
    let detail = fixture();
    detail.findings = [];
    detail.task.requirements[0]!.verificationMethods = ["automated", "human"];
    detail.evidence[0] = {
      ...detail.evidence[0]!,
      specVersion: 2,
      content: detail.observedContent!,
    };
    const slot = mount(detail, { factoryGetTask: () => detail });
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(
      slot.getByText("0 accepted · 0 failed · 0 stale · 5 unverified"),
    ).toBeTruthy();
    fireEvent.change(slot.getByLabelText("Filter by method"), {
      target: { value: "human" },
    });
    expect(slot.getByText("Check + Human")).toBeTruthy();
    detail = {
      ...detail,
      judgments: [
        {
          id: "j1",
          taskId: "task-1",
          requirementId: "BOOK-1",
          specVersion: 2,
          fingerprint: "current-content-sha",
          actor: "User",
          rationale: "",
          accepted: true,
          createdAt: 5000,
        },
      ],
    };
    await slot.emitRealtime("factory-tasks", { taskId: detail.task.id });
    await slot.findByText("1 accepted · 0 failed · 0 stale · 4 unverified");
  });

  it("shows persisted delivery approval without changing verification coverage", async () => {
    const detail = fixture();
    const approved = {
      ...detail,
      approvals: [
        {
          id: "approval-1",
          taskId: detail.task.id,
          specVersion: detail.task.specVersion,
          fingerprint: "current-content-sha",
          scope: "delivery" as const,
          requirementIds: detail.task.requirements.map((r) => r.id),
          accepted: true,
          actor: "User",
          source: "ui" as const,
          sourceRef: null,
          rationale: "",
          createdAt: 5000,
        },
      ],
    };
    const slot = mount(detail, {
      factoryApproveDelivery: vi.fn(async () => approved),
    });
    await slot.findByRole("button", { name: "Approve" });
    fireEvent.click(slot.getByRole("button", { name: "Approve" }));
    await slot.findByText(
      "Delivery approved. Verification coverage is shown separately.",
    );
    expect(
      slot.getByText("0 accepted · 1 failed · 0 stale · 4 unverified"),
    ).toBeTruthy();
  });

  it("selects all requirements across pages and filters for one approval", async () => {
    const detail = bulkFixture(100);
    const approve = vi.fn(async () => detail);
    const slot = mount(detail, { factoryApproveDelivery: approve });
    await slot.findByRole("heading", { name: detail.task.goal });
    fireEvent.change(slot.getByLabelText("Search requirements"), {
      target: { value: "number 99" },
    });
    fireEvent.click(slot.getByRole("button", { name: "Select all (100)" }));
    fireEvent.click(slot.getByRole("button", { name: "Approve selected" }));
    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "selected",
          requirementIds: detail.task.requirements.map((r) => r.id),
        }),
      ),
    );
    fireEvent.click(slot.getByRole("button", { name: "Select all (100)" }));
    fireEvent.click(slot.getByRole("button", { name: "Deselect all" }));
    expect(slot.queryByRole("button", { name: "Approve selected" })).toBeNull();
  });

  it("approves exact selections across pages and filters without a rationale form", async () => {
    const detail = bulkFixture(100);
    const approve = vi.fn(async () => detail);
    const slot = mount(detail, { factoryApproveDelivery: approve });
    await slot.findByRole("heading", { name: detail.task.goal });
    fireEvent.click(slot.getByRole("checkbox", { name: /^Select R-1:/ }));
    fireEvent.click(slot.getByRole("button", { name: /Next/ }));
    fireEvent.click(slot.getByRole("checkbox", { name: /^Select R-13:/ }));
    fireEvent.change(slot.getByLabelText("Search requirements"), {
      target: { value: "number 99" },
    });
    expect(slot.getByText("Selected requirements (2): R-1, R-13")).toBeTruthy();
    expect(slot.queryByLabelText("Review notes")).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Approve selected" }));
    await waitFor(() =>
      expect(approve).toHaveBeenCalledExactlyOnceWith({
        taskId: "task-1",
        expectedVersion: 2,
        expectedFingerprint: "current-content-sha",
        scope: "selected",
        requirementIds: ["R-1", "R-13"],
        accepted: true,
        actor: "User",
        humanConfirmed: true,
        source: "ui",
        sourceRef: null,
        rationale: "",
      }),
    );
  });

  it("approves delivery with explicit whole-task scope despite active filters", async () => {
    const detail = fixture();
    const approve = vi.fn(async () => detail);
    const slot = mount(detail, { factoryApproveDelivery: approve });
    await slot.findByRole("heading", { name: detail.task.goal });
    fireEvent.change(slot.getByLabelText("Filter by method"), {
      target: { value: "human" },
    });
    expect(
      slot.getByText("Delivery approval · all 5 requirements · spec v2"),
    ).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "delivery",
          requirementIds: [],
          rationale: "",
        }),
      ),
    );
    expect(
      slot.getByText("0 accepted · 1 failed · 0 stale · 4 unverified"),
    ).toBeTruthy();
  });

  it("clears selected approval scope after a specification change", async () => {
    let detail = fixture();
    const slot = mount(detail, { factoryGetTask: () => detail });
    await slot.findByRole("heading", { name: detail.task.goal });
    fireEvent.click(
      slot.getByRole("checkbox", { name: /waitlist message is clear/i }),
    );
    detail = { ...detail, task: { ...detail.task, specVersion: 3 } };
    await slot.emitRealtime("factory-tasks", { taskId: detail.task.id });
    await slot.findByText("Spec v3");
    expect(slot.queryByRole("button", { name: "Approve selected" })).toBeNull();
    expect(
      slot.getByText("Delivery approval · all 5 requirements · spec v3"),
    ).toBeTruthy();
  });

  it("sends an agent review request through the composer with ids and context", async () => {
    const detail = fixture();
    const slot = mount(detail);
    await slot.findByRole("heading", { name: detail.task.goal });
    fireEvent.click(slot.getByRole("button", { name: "Request agent review" }));
    expect(slot.composer.quotes[0]).toContain("task-1");
    expect(slot.composer.quotes[0]).toContain("spec v2");
    expect(slot.composer.quotes[0]).toContain("AGENT-1");
    expect(slot.composer.quotes[0]).not.toContain("BOOK-1");
    expect(slot.composer.text).toContain("Keep this draft");
    expect(slot.composer.submits).toEqual([]);
  });

  it("does not restore a prior human selection when content changes and then returns", async () => {
    let detail = fixture();
    const slot = mount(detail, { factoryGetTask: () => detail });
    await slot.findByRole("heading", { name: detail.task.goal });
    fireEvent.click(
      slot.getByRole("checkbox", { name: /waitlist message is clear/i }),
    );
    expect(
      slot
        .getByRole("button", { name: "Approve selected" })
        .hasAttribute("disabled"),
    ).toBe(false);
    detail = {
      ...detail,
      task: { ...detail.task, statusDetail: "Result B" },
      observedContent: {
        ...detail.observedContent!,
        fingerprint: "changed-content",
      },
    };
    await slot.emitRealtime("factory-tasks", { taskId: detail.task.id });
    await slot.findByText("Result B");
    expect(
      slot.getByRole("button", { name: "Approve" }).hasAttribute("disabled"),
    ).toBe(false);
    detail = {
      ...detail,
      task: { ...detail.task, statusDetail: "Result A restored" },
      observedContent: {
        ...detail.observedContent!,
        fingerprint: "current-content-sha",
      },
    };
    await slot.emitRealtime("factory-tasks", { taskId: detail.task.id });
    await slot.findByText("Result A restored");
    expect(slot.queryByRole("button", { name: "Approve selected" })).toBeNull();
    expect(
      slot.getByRole("button", { name: "Approve" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("preserves expanded requirements across pages and live updates", async () => {
    let detail = bulkFixture(100);
    const slot = mount(detail, { factoryGetTask: () => detail });
    await slot.findByRole("heading", { name: detail.task.goal });
    const row = slot.container.querySelector<HTMLDetailsElement>(
      ".factory-requirement",
    )!;
    fireEvent.click(row.querySelector("summary")!);
    await waitFor(() => expect(row.open).toBe(true));
    fireEvent.click(slot.getByRole("button", { name: /Next/ }));
    fireEvent.click(slot.getByRole("button", { name: /Previous/ }));
    expect(
      slot.container.querySelector<HTMLDetailsElement>(".factory-requirement")!
        .open,
    ).toBe(true);
    detail = {
      ...detail,
      task: { ...detail.task, statusDetail: "Progress refreshed" },
    };
    await slot.emitRealtime("factory-tasks", { taskId: detail.task.id });
    await slot.findByText("Progress refreshed");
    expect(
      slot.container.querySelector<HTMLDetailsElement>(".factory-requirement")!
        .open,
    ).toBe(true);
  });

  it("shows a draft without a misleading Start execution button", async () => {
    const detail = fixture();
    detail.task = { ...detail.task, phase: "draft", status: "unverified" };
    const start = vi.fn(async () => ({
      ...detail,
      task: { ...detail.task, phase: "active" as const },
    }));
    const slot = mount(detail, { factoryStartTask: start });
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(
      slot.getByText("Draft", { selector: ".factory-status" }),
    ).toBeTruthy();
    expect(
      slot.container
        .querySelector(".factory-target-details")!
        .hasAttribute("open"),
    ).toBe(false);
    expect(slot.getByText("Target environment")).toBeTruthy();
    expect(slot.getAllByText("env-1").length).toBeGreaterThan(0);
    expect(slot.queryByRole("button", { name: "Run checks" })).toBeNull();
    expect(
      slot.queryByRole("button", { name: "Request agent review" }),
    ).toBeNull();
    expect(slot.queryByText("Human review")).toBeNull();
    expect(slot.queryByRole("checkbox")).toBeNull();
    expect(slot.queryByRole("button", { name: "Start task" })).toBeNull();
    expect(
      slot.getByText(
        "Refine this draft or ask to begin implementation in chat.",
      ),
    ).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });

  it("keeps review actions out of a stopped task", async () => {
    const detail = fixture();
    detail.task.stopRequested = true;
    const judge = vi.fn(async () => detail);
    const slot = mount(detail, { factoryRecordJudgments: judge });
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(slot.queryByRole("button", { name: "Run checks" })).toBeNull();
    expect(
      slot.queryByRole("button", { name: "Request agent review" }),
    ).toBeNull();
    expect(slot.queryByText("Human review")).toBeNull();
    expect(slot.queryByRole("checkbox")).toBeNull();
    expect(judge).not.toHaveBeenCalled();
  });

  it("disables review submission while content identity is unknown", async () => {
    const detail = fixture();
    detail.observedContent = null;
    const judge = vi.fn(async () => detail);
    const slot = mount(detail, { factoryRecordJudgments: judge });
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(
      slot.getByText(/Current result content is not fully captured/),
    ).toBeTruthy();
    const checkbox = slot.getByRole("checkbox", {
      name: /waitlist message is clear/i,
    });
    expect(checkbox.hasAttribute("disabled")).toBe(false);
    expect(
      slot.getByRole("button", { name: "Approve" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(judge).not.toHaveBeenCalled();
    expect(
      slot.getAllByText(/not fully captured|Live updates are unavailable/)
        .length,
    ).toBe(1);
  });

  it("paginates, searches and filters a 100-requirement spec", async () => {
    const detail = bulkFixture(100);
    const slot = mount(detail);
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(
      slot.getByText("0 accepted · 0 failed · 0 stale · 100 unverified"),
    ).toBeTruthy();
    const rowCount = () =>
      within(slot.container)
        .queryAllByText(/Requirement number/)
        .filter((node) => node.closest(".factory-requirement")).length;
    expect(rowCount()).toBe(12);
    expect(slot.getByText("1–12 of 100")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: /Next/ }));
    expect(slot.getByText("13–24 of 100")).toBeTruthy();
    expect(rowCount()).toBe(12);
    fireEvent.change(slot.getByLabelText("Search requirements"), {
      target: { value: "number 99" },
    });
    expect(rowCount()).toBe(1);
    expect(slot.queryByRole("button", { name: /Next/ })).toBeNull();
    fireEvent.change(slot.getByLabelText("Search requirements"), {
      target: { value: "" },
    });
    fireEvent.change(slot.getByLabelText("Filter by method"), {
      target: { value: "human" },
    });
    expect(rowCount()).toBe(10);
    expect(slot.getByText("1–10 of 10")).toBeTruthy();
    fireEvent.change(slot.getByLabelText("Filter by method"), {
      target: { value: "agent" },
    });
    expect(rowCount()).toBe(10);
    fireEvent.change(slot.getByLabelText("Filter by status"), {
      target: { value: "accepted" },
    });
    expect(rowCount()).toBe(0);
    expect(slot.getByText(/No requirements match/)).toBeTruthy();
  });

  it("discusses findings in chat without a mandatory form and preserves failed actions", async () => {
    const detail = fixture();
    const verify = vi.fn(async () => {
      throw new Error("Host disconnected; no checks ran");
    });
    const slot = mount(detail, { factoryVerifyTask: verify });
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(slot.queryByLabelText("Resolution evidence")).toBeNull();
    expect(slot.container.querySelector("textarea")).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Discuss in chat" }));
    expect(slot.composer.quotes[0]).toContain("review-1");
    expect(slot.composer.quotes[0]).toContain("task-1");
    expect(slot.composer.text).toContain("Keep this draft");
    expect(slot.composer.submits).toEqual([]);
    fireEvent.click(slot.getByRole("button", { name: "Run checks" }));
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Host disconnected; no checks ran",
    );
    expect(
      slot.getByRole("button", { name: "Run checks" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("keeps scope readable and duplicate agent panels out of the card", async () => {
    const detail = fixture();
    detail.task.requirements[0]!.text = "Long domain requirement ".repeat(80);
    const slot = mount(detail);
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(slot.getByRole("region", { name: "Scope" }).textContent).toContain(
      detail.task.scope,
    );
    expect(slot.queryByText("Proposed team")).toBeNull();
    expect(slot.queryByRole("heading", { name: "Assignments" })).toBeNull();
    expect(
      slot.container.querySelector(".factory-requirement-text")!.textContent,
    ).toBe(detail.task.requirements[0]!.text);
    expect(
      slot.container.querySelector(".factory-requirements-heading")!
        .textContent,
    ).toContain("Coverage");
    expect(
      slot.container
        .querySelector(".factory-requirement")!
        .hasAttribute("open"),
    ).toBe(false);
  });

  it("renders versioned notes with artifacts and salient conclusions", async () => {
    const detail = fixture();
    detail.notes = [
      {
        id: "n1",
        taskId: "task-1",
        kind: "note" as const,
        text: "Watching flaky retries.",
        artifactRefs: [],
        specVersion: 1,
        fingerprint: "old-content-sha",
        createdAt: 2000,
      },
      {
        id: "n2",
        taskId: "task-1",
        kind: "conclusion" as const,
        text: "Row lock resolves the race.",
        artifactRefs: ["https://example.com/result"],
        specVersion: 2,
        fingerprint: "current-content-sha",
        createdAt: 4000,
      },
    ];
    const slot = mount(detail);
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(slot.getByText("Conclusion")).toBeTruthy();
    expect(slot.getByText("Row lock resolves the race.")).toBeTruthy();
    expect(slot.getByText("https://example.com/result")).toBeTruthy();
    openSummary(slot, "Notes & artifacts");
    expect(slot.getByText("Watching flaky retries.")).toBeTruthy();
  });

  it("cancels only running execution and exposes explicit resume for legacy stops", async () => {
    let detail = fixture();
    const stop = vi.fn(async () => {
      detail = {
        ...detail,
        task: { ...detail.task, executionRunning: false, stopRequested: true },
      };
      return detail;
    });
    const resume = vi.fn(async () => ({
      ...detail,
      task: { ...detail.task, stopRequested: false },
    }));
    const slot = mount(detail, {
      factoryGetTask: () => detail,
      factoryCancelTask: stop,
      factoryResumeTask: resume,
    });
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(slot.queryByRole("button", { name: "Cancel" })).toBeNull();
    detail = { ...detail, task: { ...detail.task, executionRunning: true } };
    await slot.emitRealtime("factory-tasks", { taskId: detail.task.id });
    fireEvent.click(await slot.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(stop).toHaveBeenCalledWith({ taskId: "task-1", archive: false }),
    );
    fireEvent.click(await slot.findByRole("button", { name: "Resume task" }));
    await waitFor(() =>
      expect(resume).toHaveBeenCalledWith({
        taskId: "task-1",
        expectedVersion: 2,
      }),
    );
    expect(slot.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Request edits" }));
    expect(slot.composer.text).toContain("Keep this draft");
    expect(slot.composer.quotes[0]).toContain("task-1, spec v2");
    expect(slot.composer.submits).toEqual([]);
  });

  it("retains Delivered history when current workspace coverage changes", async () => {
    let detail = fixture();
    detail.deliveries = [
      {
        id: "d1",
        taskId: "task-1",
        specVersion: 1,
        content: detail.evidence[0]!.content,
        mergeUrl: "https://example.com/pull/1",
        status: "delivered",
        verificationStatus: "accepted",
        createdAt: 3000,
      },
    ];
    const slot = mount(detail, { factoryGetTask: () => detail });
    await slot.findByRole("heading", { name: detail.task.goal });
    expect(
      within(slot.container.querySelector(".factory-detail-header")!).getByText(
        "Delivered",
      ),
    ).toBeTruthy();
    expect(
      within(
        slot.container.querySelector(".factory-detail-header")!,
      ).queryByText("Stale"),
    ).toBeNull();
    expect(slot.getByText("Current coverage")).toBeTruthy();
    openSummary(slot, "Historical snapshots (1)");
    expect(slot.getByText("Coverage at delivery: accepted")).toBeTruthy();
    expect(
      slot.getByRole("link", { name: "https://example.com/pull/1" }),
    ).toBeTruthy();
    detail = {
      ...detail,
      task: { ...detail.task, specVersion: 3, statusDetail: "Later workspace" },
    };
    await slot.emitRealtime("factory-tasks", { taskId: detail.task.id });
    await slot.findByText("Spec v3");
    expect(
      within(slot.container.querySelector(".factory-detail-header")!).getByText(
        "Delivered",
      ),
    ).toBeTruthy();
    expect(
      within(
        slot.container.querySelector(".factory-detail-header")!,
      ).queryByText("Stale"),
    ).toBeNull();
    expect(slot.getByText("Current coverage")).toBeTruthy();
    expect(slot.getByText("Coverage at delivery: accepted")).toBeTruthy();
    expect(
      slot.getByText("0 accepted · 1 failed · 0 stale · 4 unverified"),
    ).toBeTruthy();
  });

  it("shows task list errors instead of implying an empty list and supports retry", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValue({ tasks: [] });
    const slot = renderSlot(
      panel,
      { threadId: "lead-1", params: {} },
      { rpc: { factoryListTasks: list } },
    );
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Network unavailable",
    );
    expect(slot.queryByText("Start with the goal")).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await slot.findByText("Start with the goal");
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("opens a presented spec once and respects closing it across remounts", async () => {
    sessionStorage.clear();
    const detail = fixture();
    const props = {
      attributes: { taskId: "task-1", open: "true" },
      source: '::factory-task{taskId="task-1" open="true"}',
      message: {
        id: "auto-open-message",
        threadId: "lead-1",
        turnId: null,
        projectId: "project-1",
      },
      openWorkspaceFile: null,
    };
    const options = {
      rpc: { factoryGetTask: vi.fn(async () => detail) },
      openThreadPanel: () => true,
    };
    const slot = renderSlot(directive, props, options);
    await slot.findByText(detail.task.goal);
    await waitFor(() => expect(slot.navigateCalls).toHaveLength(1));
    expect(slot.navigateCalls[0]).toMatchObject({
      method: "openThreadPanel",
      options: { params: { taskId: "task-1" } },
    });
    await slot.emitRealtime("factory-tasks", { taskId: "task-1" });
    expect(slot.navigateCalls).toHaveLength(1);
    slot.unmount();
    const reopened = renderSlot(directive, props, options);
    await reopened.findByText(detail.task.goal);
    expect(reopened.navigateCalls).toHaveLength(0);
    sessionStorage.clear();
  });

  it("does not present cached acceptance as current while disconnected or after refresh failure", async () => {
    const detail = fixture();
    detail.task.status = "accepted";
    const get = vi
      .fn()
      .mockResolvedValueOnce(detail)
      .mockRejectedValueOnce(new Error("Refresh failed"))
      .mockResolvedValue(detail);
    const slot = renderSlot(
      directive,
      {
        attributes: { taskId: "task-1" },
        source: '::factory-task{taskId="task-1"}',
        message: {
          id: "message-1",
          threadId: "lead-1",
          turnId: null,
          projectId: "project-1",
        },
        openWorkspaceFile: null,
      },
      { rpc: { factoryGetTask: get } },
    );
    await slot.findByText("Accepted");
    await slot.setRealtimeConnectionState("reconnecting");
    expect(
      slot.queryByText("Accepted", { selector: ".factory-status" }),
    ).toBeNull();
    expect(slot.getByText("Status unavailable")).toBeTruthy();
    await slot.setRealtimeConnectionState("connected");
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Refresh failed",
    );
    expect(
      slot.queryByText("Accepted", { selector: ".factory-status" }),
    ).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await slot.findByText("Accepted");
  });

  it("coalesces relevant realtime updates and ignores unrelated tasks", async () => {
    const detail = fixture();
    const get = vi.fn(async () => detail);
    const slot = mount(detail, { factoryGetTask: get });
    await slot.findByRole("heading", { name: detail.task.goal });
    await slot.emitRealtime("factory-tasks", {
      taskId: "other",
      threadId: "lead-1",
    });
    expect(get).toHaveBeenCalledTimes(1);
    await slot.emitRealtime("factory-tasks", {
      taskId: "task-1",
      threadId: "lead-1",
    });
    await slot.emitRealtime("factory-tasks", {
      taskId: "task-1",
      threadId: "lead-1",
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(
      within(slot.container).getByRole("heading", { name: detail.task.goal }),
    ).toBeTruthy();
  });
});

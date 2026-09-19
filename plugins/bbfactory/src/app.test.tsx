// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
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
    goal: "Keep the final place exclusive",
    scope: "Booking API and waitlist behavior.",
    requirements: [
      {
        id: "BOOK-1",
        text: "Exactly one concurrent booking succeeds",
        criterion: "automated" as const,
      },
      {
        id: "VISUAL",
        text: "The waitlist message is clear",
        criterion: "human" as const,
      },
      {
        id: "UNMAPPED",
        text: "Cancellation restores availability",
        criterion: "automated" as const,
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
    task: {
      ...spec,
      id: "task-1",
      projectId: "project-1",
      originThreadId: "lead-1",
      environmentId: "env-1",
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
  it("keeps historical passes separate from current stale acceptance and exposes real check evidence", async () => {
    const slot = mount();
    await slot.findByRole("heading", {
      name: "Keep the final place exclusive",
    });
    expect(slot.getByText("Stale")).toBeTruthy();
    expect(slot.queryByText("Accepted")).toBeNull();
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
    expect(slot.getByText("Added cancellation behavior")).toBeTruthy();
  });

  it("requires an explicit personal attestation and notes before human judgment", async () => {
    const detail = fixture();
    const judge = vi.fn(async () => detail);
    const slot = mount(detail, { factoryRecordJudgment: judge });
    await slot.findByRole("heading", { name: detail.task.goal });
    openSummary(slot, "The waitlist message is clear");
    const accept = slot.getByRole("button", { name: "Accept requirement" });
    expect(accept.hasAttribute("disabled")).toBe(true);
    fireEvent.change(slot.getByLabelText("Review notes"), {
      target: { value: "Reviewed the waitlist message on mobile." },
    });
    expect(accept.hasAttribute("disabled")).toBe(true);
    fireEvent.click(
      slot.getByRole("checkbox", {
        name: "I personally reviewed this requirement.",
      }),
    );
    fireEvent.click(accept);
    await waitFor(() =>
      expect(judge).toHaveBeenCalledWith({
        taskId: "task-1",
        requirementId: "VISUAL",
        accepted: true,
        actor: "User",
        rationale: "Reviewed the waitlist message on mobile.",
        humanConfirmed: true,
        expectedVersion: 2,
        expectedFingerprint: "current-content-sha",
      }),
    );
    await waitFor(() => expect(accept.hasAttribute("disabled")).toBe(true));
  });

  it("blocks judgment without known content and resets attestation when content changes", async () => {
    let detail = fixture();
    detail.observedContent = null;
    const judge = vi.fn(async () => detail);
    const slot = mount(detail, {
      factoryGetTask: () => detail,
      factoryRecordJudgment: judge,
    });
    await slot.findByRole("heading", { name: detail.task.goal });
    openSummary(slot, "The waitlist message is clear");
    fireEvent.change(slot.getByLabelText("Review notes"), {
      target: { value: "Checked the mobile result." },
    });
    const checkbox = slot.getByRole("checkbox", {
      name: "I personally reviewed this requirement.",
    });
    fireEvent.click(checkbox);
    expect(
      slot
        .getByRole("button", { name: "Accept requirement" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(judge).not.toHaveBeenCalled();
    detail = fixture();
    await slot.emitRealtime("factory-tasks", { taskId: "task-1" });
    await waitFor(() =>
      expect(slot.getByText("Content current-content-sha")).toBeTruthy(),
    );
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    expect(
      slot
        .getByRole("button", { name: "Accept requirement" })
        .hasAttribute("disabled"),
    ).toBe(false);
    detail = {
      ...detail,
      observedContent: {
        ...detail.observedContent!,
        fingerprint: "changed-content-sha",
      },
    };
    await slot.emitRealtime("factory-tasks", { taskId: "task-1" });
    await waitFor(() =>
      expect(slot.getByText("Content changed-content-sha")).toBeTruthy(),
    );
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    expect(
      slot
        .getByRole("button", { name: "Accept requirement" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(judge).not.toHaveBeenCalled();
  });

  it("preserves failed actions and only resolves a required finding with evidence", async () => {
    const detail = fixture();
    const resolve = vi.fn(async () => ({
      ...detail,
      findings: [
        {
          ...detail.findings[0]!,
          resolution: "Locked the row; concurrent request test passes.",
        },
      ],
    }));
    const verify = vi.fn(async () => {
      throw new Error("Host disconnected; no checks ran");
    });
    const slot = mount(detail, {
      factoryResolveFinding: resolve,
      factoryVerifyTask: verify,
    });
    await slot.findByRole("heading", { name: detail.task.goal });
    const resolveButton = slot.getByRole("button", { name: "Resolve finding" });
    expect(resolveButton.hasAttribute("disabled")).toBe(true);
    fireEvent.change(slot.getByLabelText("Resolution evidence"), {
      target: { value: "Locked the row; concurrent request test passes." },
    });
    fireEvent.click(resolveButton);
    await waitFor(() =>
      expect(resolve).toHaveBeenCalledWith({
        taskId: "task-1",
        findingId: "review-1",
        resolution: "Locked the row; concurrent request test passes.",
      }),
    );
    await slot.findByText("Resolved");
    fireEvent.click(
      slot.getByRole("button", { name: "Verify current content" }),
    );
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Host disconnected; no checks ran",
    );
    expect(slot.getByText("Status unavailable")).toBeTruthy();
    expect(
      slot
        .getByRole("button", { name: "Verify current content" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("links native work, preserves the chat draft and sends stop through the real RPC", async () => {
    const detail = fixture();
    const stop = vi.fn(async () => ({
      ...detail,
      task: { ...detail.task, stopRequested: true },
    }));
    const slot = mount(detail, { factoryCancelTask: stop });
    await slot.findByRole("heading", { name: detail.task.goal });
    openSummary(slot, "Booking concurrency");
    fireEvent.click(slot.getByRole("button", { name: "Open native thread" }));
    expect(slot.navigateCalls).toContainEqual({
      method: "toThread",
      threadId: "worker-1",
    });
    fireEvent.click(slot.getByRole("button", { name: "Request edits" }));
    expect(slot.composer.text).toContain("Keep this draft");
    expect(slot.composer.quotes[0]).toContain("task-1, spec v2");
    expect(slot.composer.submits).toEqual([]);
    fireEvent.click(slot.getByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(stop).toHaveBeenCalledWith({ taskId: "task-1", archive: false }),
    );
    await slot.findByRole("button", { name: "Retry stop" });
    expect(
      slot.getByText(
        "Stop requested. Native assignment status below records the outcome.",
      ),
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
        attributes: { task: "task-1" },
        source: '::factory-task{task="task-1"}',
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
    expect(slot.queryByText("Accepted")).toBeNull();
    expect(slot.getByText("Status unavailable")).toBeTruthy();
    await slot.setRealtimeConnectionState("connected");
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Refresh failed",
    );
    expect(slot.queryByText("Accepted")).toBeNull();
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

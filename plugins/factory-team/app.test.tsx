// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

const selection = vi.hoisted(() => vi.fn());
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return {
    ...actual,
    useComposer: () => ({
      ...actual.useComposer(),
      experimental_setSelection: selection,
    }),
  };
});
const app = await loadPluginApp(() => import("./app.js"));
const action = app.composerCustomizations[0]!.actions![0]!;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const view = {
  preference: { mode: "auto", profiles: [] },
  revision: 0,
  environmentId: "env-remote",
};
function mount(
  set = vi.fn(async () => ({
    preference: { mode: "off", profiles: [] },
    revision: 1,
  })),
) {
  return {
    set,
    slot: renderSlot(
      action,
      {},
      {
        composer: { scope: { kind: "thread", threadId: "thread-1" } },
        rpc: { get: () => view, set },
      },
    ),
  };
}

async function chooseMode(slot: ReturnType<typeof renderSlot>, mode: string) {
  fireEvent.keyDown(slot.getByRole("button", { name: "Team mode" }), {
    key: "ArrowDown",
  });
  fireEvent.click(
    await slot.findByRole("menuitem", { name: new RegExp(mode) }),
  );
}

describe("native Team control", () => {
  it("saves Off without altering the lead or submitting the draft", async () => {
    const { slot, set } = mount();
    fireEvent.click(await slot.findByRole("button", { name: "Team: Auto" }));
    await chooseMode(slot, "Off");
    fireEvent.click(slot.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        scope: { kind: "thread", id: "thread-1" },
        preference: { mode: "off", profiles: [] },
        expectedRevision: 0,
      }),
    );
    expect(await slot.findByRole("button", { name: "Team: Off" })).toBeTruthy();
  });

  it("uses the host picker with environment routing and blocks an empty selected team", async () => {
    const { slot, set } = mount();
    fireEvent.click(await slot.findByRole("button", { name: "Team: Auto" }));
    await chooseMode(slot, "Selected implementers");
    expect(
      slot.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(slot.getByRole("button", { name: /Add implementer/ }));
    expect(
      slot
        .getByTestId("bb-provider-model-picker")
        .getAttribute("data-routing-id"),
    ).toBe("env-remote");
    expect(
      slot
        .getByTestId("bb-provider-model-picker")
        .getAttribute("data-provider-change-allowed"),
    ).toBe("true");
    fireEvent.click(slot.getByRole("button", { name: "Cancel" }));
    expect(set).not.toHaveBeenCalled();
  });

  it("keeps saved state unchanged and exposes a failed save", async () => {
    const { slot } = mount(
      vi.fn(async () => {
        throw new Error("Server unavailable");
      }),
    );
    fireEvent.click(await slot.findByRole("button", { name: "Team: Auto" }));
    await chooseMode(slot, "Off");
    fireEvent.click(slot.getByRole("button", { name: "Save" }));
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Server unavailable",
    );
    expect(slot.getByRole("button", { name: "Team: Auto" })).toBeTruthy();
  });
  it("resolves the new-thread machine before loading and preserves routing across scoped reloads", async () => {
    selection.mockResolvedValue({
      environment: { type: "host", hostId: "host-new" },
      providerId: "codex",
      model: "sol",
      reasoningLevel: "high",
    });
    let resolveGet!: (value: typeof view) => void;
    const firstGet = new Promise<typeof view>((resolve) => {
      resolveGet = resolve;
    });
    const get = vi.fn().mockReturnValueOnce(firstGet).mockResolvedValue(view);
    const slot = renderSlot(
      action,
      {},
      {
        composer: { scope: { kind: "new-thread", projectId: "project-1" } },
        rpc: { get },
      },
    );
    fireEvent.click(slot.getByRole("button", { name: "Team: loading" }));
    await waitFor(() => expect(selection).toHaveBeenCalledWith({}));
    resolveGet(view);
    await slot.findByRole("button", { name: "Team mode" });
    await chooseMode(slot, "Selected implementers");
    fireEvent.click(slot.getByRole("button", { name: "Add implementer" }));
    expect(
      slot
        .getByTestId("bb-provider-model-picker")
        .getAttribute("data-routing-id"),
    ).toBe("host-new");
    await slot.emitRealtime("team-changed", {
      kind: "thread",
      id: "unrelated",
    });
    expect(slot.queryByText(/Reload before saving/)).toBeNull();
    await slot.emitRealtime("team-changed", {
      kind: "project",
      id: "project-1",
    });
    fireEvent.click(slot.getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(slot.queryByText(/Reload before saving/)).toBeNull(),
    );
    await chooseMode(slot, "Selected implementers");
    fireEvent.click(slot.getByRole("button", { name: "Add implementer" }));
    expect(
      slot
        .getByTestId("bb-provider-model-picker")
        .getAttribute("data-routing-id"),
    ).toBe("host-new");
    fireEvent.click(slot.getByRole("button", { name: "Cancel" }));
    selection.mockResolvedValue({
      environment: { type: "provider", providerId: "sandbox" },
    });
    fireEvent.click(slot.getByRole("button", { name: "Team: Auto" }));
    await slot.findByRole("alert");
    await chooseMode(slot, "Selected implementers");
    expect(
      slot
        .getByRole("button", { name: "Add implementer" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("blocks adding a model twice even with different reasoning", async () => {
    const profile = {
      providerId: "codex",
      model: "sol",
      reasoningLevel: "high",
    };
    const slot = renderSlot(
      action,
      {},
      {
        composer: { scope: { kind: "thread", threadId: "thread-1" } },
        rpc: {
          get: () => ({
            ...view,
            preference: { mode: "selected", profiles: [profile] },
          }),
        },
      },
    );
    fireEvent.click(
      await slot.findByRole("button", { name: "Team: 1 profile" }),
    );
    fireEvent.click(slot.getByRole("button", { name: "Add implementer" }));
    const candidate = within(
      slot.getAllByTestId("bb-provider-model-picker")[1]!,
    );
    fireEvent.change(candidate.getByLabelText("Provider ID"), {
      target: { value: "codex" },
    });
    fireEvent.change(candidate.getByLabelText("Model"), {
      target: { value: "sol" },
    });
    fireEvent.click(
      candidate.getByRole("button", { name: "Apply execution selection" }),
    );
    expect(slot.getByText(/Already selected/)).toBeTruthy();
    expect(
      slot
        .getByRole("button", { name: "Add to team" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(candidate.getByLabelText("Model"), {
      target: { value: "luna" },
    });
    fireEvent.click(
      candidate.getByRole("button", { name: "Apply execution selection" }),
    );
    fireEvent.click(slot.getByRole("button", { name: "Add to team" }));
    expect(slot.getAllByTestId("bb-provider-model-picker")).toHaveLength(2);
    const second = within(slot.getAllByTestId("bb-provider-model-picker")[1]!);
    fireEvent.change(second.getByLabelText("Model"), {
      target: { value: "sol" },
    });
    fireEvent.click(
      second.getByRole("button", { name: "Apply execution selection" }),
    );
    expect(slot.getAllByTestId("bb-provider-model-picker")).toHaveLength(1);
  });
});

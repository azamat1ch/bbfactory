import { expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeHostResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";
import { usageListMethod, usageFetchMethod } from "./usage-source-contract.js";

it("lists cheaply, fetches only the selected source/provider, preserves failed measurements, and evicts removed resources", async () => {
  let enabled = true;
  let failure = false;
  let hasWork = true;
  let enabledProviderIds = new Set(["codex", "claude-code"]);
  const rpc = vi.fn(async ({ pluginId, method, input }) => {
    if (method === usageListMethod)
      return pluginId === "pool"
        ? {
            label: "Account Pooler",
            resources: [
              {
                id: "claude",
                providerId: "claude-code",
                label: "claude@example.com",
                scope: { kind: "shared" },
              },
              {
                id: "personal",
                providerId: "codex",
                label: "personal@example.com",
                scope: { kind: "shared" },
              },
              ...(hasWork
                ? [
                    {
                      id: "work",
                      providerId: "codex",
                      label: "work@example.com",
                      scope: { kind: "shared" },
                    },
                  ]
                : []),
            ],
          }
        : {
            resources: [
              {
                id: "host",
                providerId: "codex",
                label: "Codex",
                scope: { kind: "host", hostId: "host", hostName: "Machine" },
              },
            ],
          };
    if (failure) throw new Error("Upstream failed");
    return {
      observedAt: 123,
      usage: {
        status: "ok",
        accountEmail: `${input.resourceId}@example.com`,
        planLabel: null,
        windows: [
          {
            id: "week",
            label: "Weekly",
            usedPercent: 42,
            resetsAt: null,
            model: null,
            cost: null,
          },
        ],
      },
    };
  });
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: {
        list: async () => [
          makeHostResponse({
            id: "host",
            name: "Machine",
            status: "connected",
          }),
        ],
      },
      providers: {
        list: async () =>
          [
            { id: "codex", displayName: "Codex", logoUrl: "/codex.svg" },
            {
              id: "claude-code",
              displayName: "Claude Code",
              logoUrl: "/claude.svg",
            },
          ].filter((provider) => enabledProviderIds.has(provider.id)),
      },
      plugins: {
        experimental_discoverRpc: async () =>
          enabled
            ? [
                {
                  pluginId: "pool",
                  displayName: "Account Pooler",
                  method: usageListMethod,
                },
                {
                  pluginId: "local",
                  displayName: "Codex",
                  method: usageListMethod,
                },
              ]
            : [],
        callRpc: rpc,
      },
    },
  });
  plugin(host.bb);
  const request = {
    force: false,
    machineIds: null,
    providerId: null,
    maxAgeMs: 60_000,
  };
  try {
    const listed = await host.harness.behavior.callRpc("getUsage", request);
    expect(listed).toMatchObject({
      machines: [
        { id: "host" },
        {
          id: "source:pool",
          providers: [
            { providerId: "codex", usage: null },
            { providerId: "codex", usage: null },
            { providerId: "claude-code", usage: null },
          ],
        },
      ],
    });
    expect(
      rpc.mock.calls.every(([args]) => args.method === usageListMethod),
    ).toBe(true);
    const target = {
      ...request,
      machineIds: ["source:pool"],
      providerId: "codex",
    };
    await host.harness.behavior.callRpc("getUsage", target);
    expect(
      rpc.mock.calls
        .filter(([args]) => args.method === usageFetchMethod)
        .map(([args]) => [
          args.pluginId,
          args.input.resourceId,
          args.input.refresh,
        ]),
    ).toEqual([
      ["pool", "personal", false],
      ["pool", "work", false],
    ]);
    await host.harness.behavior.callRpc("getUsage", target);
    expect(
      rpc.mock.calls.filter(([args]) => args.method === usageFetchMethod),
    ).toHaveLength(2);
    failure = true;
    expect(
      await host.harness.behavior.callRpc("getUsage", {
        ...target,
        force: true,
      }),
    ).toMatchObject({
      machines: [
        { id: "host" },
        {
          id: "source:pool",
          error: "Some usage could not be refreshed.",
          providers: [
            { usage: { status: "ok" } },
            { usage: { status: "ok" } },
            { usage: null },
          ],
        },
      ],
    });
    failure = false;
    hasWork = false;
    expect(
      await host.harness.behavior.callRpc("getUsage", {
        ...target,
        force: true,
      }),
    ).toMatchObject({
      machines: [
        { id: "host" },
        {
          id: "source:pool",
          error: null,
          providers: [{ id: "pool:personal" }, { id: "pool:claude" }],
        },
      ],
    });
    await host.harness.behavior.callRpc("getUsage", {
      ...target,
      providerId: "claude-code",
    });
    expect(
      rpc.mock.calls
        .filter(([args]) => args.method === usageFetchMethod)
        .at(-1)?.[0].input.resourceId,
    ).toBe("claude");
    await host.harness.behavior.callRpc("getUsage", {
      ...target,
      machineIds: null,
    });
    expect(
      rpc.mock.calls
        .filter(([args]) => args.method === usageFetchMethod)
        .at(-1)?.[0].pluginId,
    ).toBe("local");
    const claudeFetches = rpc.mock.calls.filter(
      ([args]) =>
        args.method === usageFetchMethod && args.input.resourceId === "claude",
    ).length;
    enabledProviderIds = new Set(["codex"]);
    const disabledLazy = await host.harness.behavior.callRpc("getUsage", {
      ...request,
      providerId: "claude-code",
      machineIds: ["source:pool"],
      force: true,
    });
    expect(disabledLazy).toMatchObject({
      machines: expect.arrayContaining([
        expect.objectContaining({
          id: "source:pool",
          providers: expect.not.arrayContaining([
            expect.objectContaining({ providerId: "claude-code" }),
          ]),
        }),
      ]),
    });
    const disabledSnapshot = await host.harness.behavior.callRpc("readLimits", {
      force: false,
      machineIds: null,
      maxAgeMs: 60_000,
    });
    expect(disabledSnapshot).toMatchObject({
      snapshot: {
        machines: expect.arrayContaining([
          expect.objectContaining({
            id: "source:pool",
            providers: expect.not.arrayContaining([
              expect.objectContaining({ providerId: "claude-code" }),
            ]),
          }),
        ]),
      },
    });
    expect(
      rpc.mock.calls.filter(
        ([args]) =>
          args.method === usageFetchMethod &&
          args.input.resourceId === "claude",
      ),
    ).toHaveLength(claudeFetches);
    enabled = false;
    expect(
      await host.harness.behavior.callRpc("getUsage", request),
    ).toMatchObject({
      machines: [
        {
          id: "host",
          providers: [
            { providerId: "codex", usage: { status: "unsupported" } },
          ],
        },
      ],
    });
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

it("keeps an unconfigured shared group without hosts or measurement requests", async () => {
  const rpc = vi.fn(async () => ({ label: "Account Pooler", resources: [] }));
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: { list: async () => [] },
      providers: { list: async () => [] },
      plugins: {
        experimental_discoverRpc: async () => [
          { pluginId: "pool", displayName: "Pool", method: usageListMethod },
        ],
        callRpc: rpc,
      },
    },
  });
  plugin(host.bb);
  try {
    await expect(
      host.harness.behavior.callRpc("getUsage", {
        force: false,
        machineIds: null,
        providerId: null,
        maxAgeMs: 0,
      }),
    ).resolves.toEqual({
      machines: [
        {
          id: "source:pool",
          displayName: "Account Pooler",
          status: "connected",
          providers: [],
          error: null,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

it("lists registered providers without a usage source as unsupported, without fetching or duplicating covered rows", async () => {
  const rpc = vi.fn(async ({ method }) => {
    if (method === usageListMethod)
      return {
        resources: [
          {
            id: "host",
            providerId: "codex",
            label: "Codex",
            scope: { kind: "host", hostId: "host", hostName: "Machine" },
          },
        ],
      };
    return {
      observedAt: 456,
      usage: {
        status: "ok",
        accountEmail: "codex@example.com",
        planLabel: null,
        windows: [
          {
            id: "week",
            label: "Weekly",
            usedPercent: 10,
            resetsAt: null,
            model: null,
            cost: null,
          },
        ],
      },
    };
  });
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: {
        list: async () => [
          makeHostResponse({
            id: "host",
            name: "Machine",
            status: "connected",
          }),
          makeHostResponse({
            id: "offline",
            name: "Laptop",
            status: "disconnected",
          }),
          makeHostResponse({
            id: "failing",
            name: "Failing",
            status: "connected",
          }),
        ],
      },
      providers: {
        list: async (args?: { hostId?: string }) => {
          if (args?.hostId === "failing")
            throw new Error("provider listing failed");
          if (args?.hostId === "offline")
            return [{ id: "acp-devin", displayName: "Devin", logoUrl: null }];
          return [
            { id: "codex", displayName: "Codex", logoUrl: "/codex.svg" },
            { id: "acp-opencode", displayName: "opencode", logoUrl: null },
            { id: "acp-devin", displayName: "Devin", logoUrl: null },
          ];
        },
      },
      plugins: {
        experimental_discoverRpc: async () => [
          { pluginId: "local", displayName: "Codex", method: usageListMethod },
        ],
        callRpc: rpc,
      },
    },
  });
  plugin(host.bb);
  try {
    const snapshot = await host.harness.behavior.callRpc("getUsage", {
      force: false,
      machineIds: null,
      providerId: null,
      maxAgeMs: 0,
    });
    expect(snapshot).toMatchObject({
      machines: [
        {
          id: "host",
          providers: [
            { providerId: "codex", usage: null },
            { providerId: "acp-opencode", usage: { status: "unsupported" } },
            { providerId: "acp-devin", usage: { status: "unsupported" } },
          ],
        },
        {
          id: "offline",
          providers: [
            { providerId: "acp-devin", usage: { status: "unsupported" } },
          ],
        },
        { id: "failing", providers: [] },
      ],
    });
    expect(host.harness.sdk.callsTo("providers.list")).toEqual(
      expect.arrayContaining([[{ hostId: "host" }], [{ hostId: "offline" }]]),
    );
    expect(
      rpc.mock.calls.every(([args]) => args.method === usageListMethod),
    ).toBe(true);
    await host.harness.behavior.callRpc("getUsage", {
      force: false,
      machineIds: ["host"],
      providerId: "acp-devin",
      maxAgeMs: 0,
    });
    expect(
      rpc.mock.calls.every(([args]) => args.method === usageListMethod),
    ).toBe(true);
    await host.harness.behavior.callRpc("getUsage", {
      force: false,
      machineIds: ["host"],
      providerId: "codex",
      maxAgeMs: 0,
    });
    expect(
      rpc.mock.calls.filter(([args]) => args.method === usageFetchMethod),
    ).toHaveLength(1);
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

it("collapses known account observations per machine, preserves unknown identities, and normalizes display labels", async () => {
  const { bb, harness } = createFakePluginHost({
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: {
        list: async () => [
          makeHostResponse({ id: "host", status: "connected" }),
        ],
      },
      providers: {
        list: async () => [
          { id: "codex", displayName: "Codex", logoUrl: null },
          { id: "other", displayName: "Other", logoUrl: null },
        ],
      },
      plugins: {
        experimental_discoverRpc: async () => [
          { pluginId: "adapter", displayName: "Adapter" },
          { pluginId: "custom", displayName: "Custom" },
        ],
        callRpc: async ({ pluginId, method }) =>
          method === usageListMethod
            ? {
                resources: [
                  {
                    id: "account",
                    providerId: "codex",
                    accountKey: null,
                    label: "same@example.com",
                    scope: { kind: "host", hostId: "host", hostName: "Host" },
                  },
                  {
                    id: "unknown",
                    providerId: "other",
                    accountKey: null,
                    label: "same@example.com",
                    scope: { kind: "host", hostId: "host", hostName: "Host" },
                  },
                ],
              }
            : {
                accountKey: "issuer:account:1",
                observedAt: 123,
                usage: {
                  status: "ok",
                  accountEmail: "same@example.com",
                  planLabel: "max",
                  plan: { id: "max", multiplier: 20 },
                  windows: [
                    {
                      id: "week",
                      kind: "weekly",
                      label: "168 hour window",
                      model: null,
                      resetsAt: null,
                      cost: null,
                      usedPercent: pluginId === "adapter" ? 42 : 81,
                    },
                  ],
                },
              },
      },
    },
  });
  try {
    plugin(bb);
    const snapshot = await harness.behavior.callRpc("getUsage", {
      force: false,
      machineIds: ["host"],
      providerId: "codex",
      maxAgeMs: 0,
    });
    expect(snapshot).toMatchObject({
      machines: [
        {
          providers: [
            {
              id: "adapter:account",
              usage: {
                planLabel: "Max (20x)",
                windows: [{ label: "Weekly limit", usedPercent: 42 }],
              },
            },
            { id: "adapter:unknown", usage: null },
            { id: "custom:unknown", usage: null },
          ],
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain("81");
  } finally {
    await harness.lifecycle.dispose();
  }
});

it("exposes bounded all-provider limits, preserves freshness and unknowns, and skips disabled or disconnected providers", async () => {
  let failing = false;
  let active = 0;
  let peak = 0;
  const resources = ["codex", "claude-code", "devin", "cursor", "disabled"].map(
    (providerId) => ({
      id: providerId,
      providerId,
      label: providerId,
      scope: { kind: "shared" },
    }),
  );
  const rpc = vi.fn(async ({ method, input }) => {
    if (method === usageListMethod)
      return {
        label: "Pool",
        resources: [
          ...resources,
          {
            id: "offline",
            providerId: "codex",
            label: "Offline",
            scope: { kind: "host", hostId: "offline", hostName: "Offline" },
          },
        ],
      };
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    if (failing) throw new Error("refresh failed");
    return {
      accountKey: null,
      observedAt: 123,
      usage:
        input.resourceId === "devin"
          ? { status: "unauthenticated", accountEmail: null, planLabel: null }
          : {
              status: "ok",
              accountEmail: null,
              planLabel: null,
              windows: [
                {
                  id: "week",
                  label: "Weekly",
                  usedPercent: 0,
                  resetsAt: null,
                  model: null,
                  cost: null,
                },
              ],
            },
    };
  });
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: {
        list: async () => [
          makeHostResponse({ id: "offline", status: "disconnected" }),
        ],
      },
      providers: {
        list: async () =>
          ["codex", "claude-code", "devin", "cursor", "unsupported"].map(
            (id) => ({
              id,
              displayName: id,
              logoUrl: null,
            }),
          ),
      },
      plugins: {
        experimental_discoverRpc: async () => [
          { pluginId: "pool", displayName: "Pool", method: usageListMethod },
        ],
        callRpc: rpc,
      },
    },
  });
  plugin(host.bb);
  const request = { force: false, machineIds: null, maxAgeMs: 60_000 };
  try {
    const first = await host.harness.behavior.callRpc("readLimits", request);
    expect(peak).toBeLessThanOrEqual(3);
    expect(
      rpc.mock.calls
        .filter(([args]) => args.method === usageFetchMethod)
        .map(([args]) => args.input.resourceId),
    ).toEqual(["codex", "claude-code", "devin", "cursor"]);
    expect(first).toMatchObject({
      snapshot: {
        machines: [
          {
            id: "offline",
            providers: expect.arrayContaining([
              expect.objectContaining({
                providerId: "unsupported",
                usage: { status: "unsupported" },
              }),
            ]),
          },
          {
            id: "source:pool",
            providers: expect.arrayContaining([
              expect.objectContaining({
                providerId: "codex",
                usage: expect.objectContaining({
                  windows: [expect.objectContaining({ usedPercent: 0 })],
                }),
              }),
              expect.objectContaining({
                providerId: "devin",
                usage: { status: "unauthenticated" },
              }),
            ]),
          },
        ],
      },
      observations: expect.arrayContaining([
        expect.objectContaining({
          resourceId: "pool:codex",
          observedAt: 123,
          fetchedAt: expect.any(Number),
          refreshFailed: false,
        }),
      ]),
    });
    await host.harness.behavior.callRpc("readLimits", request);
    expect(
      rpc.mock.calls.filter(([args]) => args.method === usageFetchMethod),
    ).toHaveLength(4);
    const cli = await host.harness.runCli(["limits", "--json"]);
    expect(cli.exitCode).toBe(0);
    expect(JSON.parse(cli.stdout)).toEqual(first);
    expect(
      host.harness.registrations.experimental_publishedRpcMethods.map(
        (method) => method.method,
      ),
    ).toContain("readLimits");
    failing = true;
    const stale = await host.harness.behavior.callRpc("readLimits", {
      ...request,
      force: true,
    });
    expect(stale).toMatchObject({
      observations: expect.arrayContaining([
        expect.objectContaining({
          resourceId: "pool:codex",
          observedAt: 123,
          fetchedAt: expect.any(Number),
          refreshFailed: true,
        }),
      ]),
    });
    const scoped = await host.harness.behavior.callRpc("readLimits", {
      ...request,
      machineIds: ["source:pool"],
    });
    expect(scoped).toMatchObject({
      snapshot: { machines: [expect.objectContaining({ id: "source:pool" })] },
    });
  } finally {
    await host.harness.dispose();
  }
});

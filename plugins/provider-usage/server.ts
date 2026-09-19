import {
  normalizeUsageMeasurement,
  selectUsageResources,
} from "./usage-normalization.js";
import {
  cliCommand,
  defineCli,
  defineRpcContract,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  usageSnapshotSchema,
  type ProviderUsage,
  type UsageMachine,
  type UsageProvider,
  type UsageSnapshot,
} from "./usage-schema.js";

import {
  usageListMethod,
  usageFetchMethod,
  type UsageResourceList,
  type UsageMeasurement,
  usageSourceRpcContract,
  type UsageResource as Resource,
} from "./usage-source-contract.js";

interface SourceResult {
  pluginId: string;
  label: string | null;
  resources: UsageResourceList["resources"];
  error: string | null;
}

const TINT_COLOR_PATTERN =
  /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([-+.%\w\s,/]*\)|[a-z]{3,20})$/iu;

const limitsInputSchema = z.strictObject({
  force: z.boolean(),
  machineIds: z.nullable(z.array(z.string().check(z.minLength(1)))),
  maxAgeMs: z.number().int().nonnegative().max(300_000),
});
const limitsSnapshotSchema = z.strictObject({
  snapshot: usageSnapshotSchema,
  observations: z.array(
    z.strictObject({
      machineId: z.string(),
      resourceId: z.string(),
      observedAt: z.nullable(z.number()),
      fetchedAt: z.nullable(z.number()),
      refreshFailed: z.boolean(),
    }),
  ),
});

export const providerUsageRpcContract = defineRpcContract({
  readLimits: { input: limitsInputSchema, output: limitsSnapshotSchema },
  getUsage: {
    input: z.strictObject({
      force: z.boolean(),
      machineIds: z.nullable(z.array(z.string().check(z.minLength(1)))),
      providerId: z.nullable(z.string()),
      maxAgeMs: z.number().check(z.int(), z.nonnegative()),
    }),
    output: usageSnapshotSchema,
  },
});

type UsageRequest = z.infer<typeof providerUsageRpcContract.getUsage.input>;
function normalizedTint(
  tint: { light: string; dark: string } | undefined,
): { light: string; dark: string } | null {
  if (
    tint === undefined ||
    !TINT_COLOR_PATTERN.test(tint.light.trim()) ||
    !TINT_COLOR_PATTERN.test(tint.dark.trim())
  ) {
    return null;
  }
  return { light: tint.light.trim(), dark: tint.dark.trim() };
}

function normalizedUsage(
  usage: Resource["usage"] | undefined,
): ProviderUsage | null {
  if (usage === undefined) return null;
  switch (usage.status) {
    case "ok":
      return {
        status: "ok",
        accountEmail: usage.accountEmail || null,
        planLabel: usage.planLabel || null,
        windows: usage.windows.map((window) => ({
          label: window.label,
          usedPercent: window.usedPercent,
          resetsAt: window.resetsAt || null,
          cost: window.cost ?? null,
        })),
      };
    case "not_installed":
      return { status: "not_installed" };
    case "unauthenticated":
      return { status: "unauthenticated" };
    case "expired":
      return { status: "expired" };
    case "error":
      return {
        status: "error",
        message: usage.message || "Usage could not be collected.",
      };
  }
}

type Provider = Awaited<
  ReturnType<BbPluginApi["sdk"]["providers"]["list"]>
>[number];

function normalizedProvider(
  provider: Pick<
    Provider,
    "id" | "displayName" | "logoUrl" | "icon" | "strings"
  >,
  usage: Resource["usage"] | undefined,
): UsageProvider {
  return {
    id: provider.id,
    providerId: provider.id,
    accountLabel: null,
    displayName: provider.displayName,
    logoUrl: provider.logoUrl,
    icon: provider.icon ?? null,
    strings: { iconTint: normalizedTint(provider.strings?.iconTint) },
    signInHint:
      provider.strings?.signInHint ??
      "Sign in to " + provider.displayName + ", then reload usage.",
    expiredHint:
      provider.strings?.expiredHint ??
      "Your " +
        provider.displayName +
        " session expired. Sign in again, then reload usage.",
    usage: normalizedUsage(usage),
  };
}

function resourceProvider(
  resource: UsageResourceList["resources"][number],
  measurement: UsageMeasurement | undefined,
  pluginId: string,
  providers: Provider[],
): UsageProvider {
  const metadata = providers.find(
    (provider) => provider.id === resource.providerId,
  );
  return {
    ...normalizedProvider(
      metadata ?? {
        id: resource.providerId,
        displayName: resource.providerId,
        logoUrl: null,
      },
      measurement?.usage,
    ),
    ...(resource.scope.kind === "shared"
      ? {
          signInHint:
            "Sign in to this account in the source plugin’s settings, then reload usage.",
          expiredHint:
            "This account’s session expired. Sign in again in the source plugin’s settings, then reload usage.",
        }
      : {}),
    id: `${pluginId}:${resource.id}`,
    accountLabel:
      resource.scope.kind === "shared"
        ? (measurement?.usage.accountEmail ?? resource.label)
        : null,
  };
}

export default function providerUsagePlugin(bb: BbPluginApi): void {
  const inventories = new Map<string, SourceResult>();
  const measurements = new Map<
    string,
    { value: UsageMeasurement; loadedAt: number; fetchedAt: number }
  >();
  const failures = new Set<string>();
  const pending = new Map<
    string,
    { force: boolean; promise: Promise<UsageMeasurement> }
  >();
  const keyOf = (pluginId: string, resourceId: string) =>
    JSON.stringify([pluginId, resourceId]);
  const fetchResource = async (
    pluginId: string,
    resourceId: string,
    force: boolean,
  ): Promise<UsageMeasurement> => {
    const key = keyOf(pluginId, resourceId);
    const running = pending.get(key);
    if (running) {
      if (!force || running.force) return running.promise;
      await running.promise.catch(() => undefined);
      return fetchResource(pluginId, resourceId, force);
    }
    const promise = bb.sdk.plugins
      .callRpc({
        pluginId,
        method: usageFetchMethod,
        input: { resourceId, refresh: force },
        outputSchema: usageSourceRpcContract[usageFetchMethod].output,
        signal: AbortSignal.timeout(45_000),
      })
      .then((raw) => {
        const value = normalizeUsageMeasurement(raw);
        if (value.usage.status === "error")
          throw new Error("Usage could not be refreshed.");
        const fetchedAt = Date.now();
        measurements.set(key, { value, loadedAt: fetchedAt, fetchedAt });
        failures.delete(key);
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, { force, promise });
    return promise;
  };
  const readUsage = async (
    request: UsageRequest,
    allProviders = false,
  ): Promise<UsageSnapshot> => {
    const hostId = request.machineIds?.find((id) => !id.startsWith("source:"));
    const [hosts, sources, metadataProviders, config] = await Promise.all([
      bb.sdk.hosts
        .list()
        .then((hosts) => hosts.filter((host) => host.type !== "ephemeral")),
      bb.sdk.plugins.experimental_discoverRpc({ method: usageListMethod }),
      bb.sdk.providers
        .list(
          hostId === undefined
            ? { capability: "usage" }
            : { capability: "usage", hostId },
        )
        .catch(() => []),
      bb.sdk.system.config().catch(() => null),
    ]);
    const hostProviders = new Map<string, Provider[]>();
    await Promise.all(
      hosts.map(async (host) => {
        hostProviders.set(
          host.id,
          await bb.sdk.providers.list({ hostId: host.id }).catch(() => []),
        );
      }),
    );
    const providers: Provider[] = [];
    const providerSeen = new Set<string>();
    for (const provider of [
      ...hosts.flatMap((host) => hostProviders.get(host.id) ?? []),
      ...metadataProviders,
    ]) {
      if (providerSeen.has(provider.id)) continue;
      providerSeen.add(provider.id);
      providers.push(provider);
    }
    const enabledProviderIds = new Set(
      providers.map((provider) => provider.id),
    );
    hosts.sort(
      (a, b) =>
        Number(b.id === config?.primaryHostId) -
        Number(a.id === config?.primaryHostId),
    );
    for (const id of inventories.keys())
      if (!sources.some((source) => source.pluginId === id))
        inventories.delete(id);
    for (let offset = 0; offset < sources.length; offset += 3) {
      await Promise.all(
        sources.slice(offset, offset + 3).map(async (source) => {
          try {
            const inventory = await bb.sdk.plugins.callRpc({
              pluginId: source.pluginId,
              method: usageListMethod,
              input: {},
              outputSchema: usageSourceRpcContract[usageListMethod].output,
              signal: AbortSignal.timeout(45_000),
            });
            inventories.set(source.pluginId, {
              pluginId: source.pluginId,
              label: inventory.label ?? null,
              resources: inventory.resources,
              error: null,
            });
          } catch {
            const previous = inventories.get(source.pluginId);
            inventories.set(source.pluginId, {
              pluginId: source.pluginId,
              label: previous?.label ?? null,
              resources: previous?.resources ?? [],
              error: "Usage resources could not be listed.",
            });
          }
        }),
      );
    }
    const keys = new Set(
      [...inventories.values()].flatMap((source) =>
        source.resources.map((resource) => keyOf(source.pluginId, resource.id)),
      ),
    );
    for (const key of measurements.keys())
      if (!keys.has(key)) {
        measurements.delete(key);
        failures.delete(key);
      }
    const selected = [...inventories.values()].flatMap((source) =>
      source.resources
        .filter((resource) => {
          if (!enabledProviderIds.has(resource.providerId)) return false;
          const machineId =
            resource.scope.kind === "shared"
              ? `source:${source.pluginId}`
              : resource.scope.hostId;
          return (
            (allProviders
              ? resource.scope.kind === "shared"
                ? providerSeen.has(resource.providerId)
                : (hostProviders.get(resource.scope.hostId) ?? []).some(
                    (provider) => provider.id === resource.providerId,
                  )
              : request.providerId !== null &&
                resource.providerId === request.providerId) &&
            (request.machineIds === null ||
              request.machineIds.includes(machineId)) &&
            (resource.scope.kind === "shared" ||
              hosts.some(
                (host) =>
                  resource.scope.kind === "host" &&
                  host.id === resource.scope.hostId &&
                  host.status === "connected",
              ))
          );
        })
        .map((resource) => ({ source, resource })),
    );
    for (let offset = 0; offset < selected.length; offset += 3) {
      await Promise.all(
        selected.slice(offset, offset + 3).map(async ({ source, resource }) => {
          const key = keyOf(source.pluginId, resource.id);
          const cached = measurements.get(key);
          if (
            !request.force &&
            cached &&
            Date.now() - cached.loadedAt < request.maxAgeMs
          )
            return;
          try {
            await fetchResource(source.pluginId, resource.id, request.force);
          } catch {
            failures.add(key);
          }
        }),
      );
    }
    const machines: UsageMachine[] = hosts.map((host) => ({
      id: host.id,
      displayName: host.name,
      status: host.status,
      providers: [],
      error: null,
    }));
    const candidates: Array<{
      source: SourceResult;
      resource: UsageResourceList["resources"][number];
      machineId: string;
    }> = [];
    for (const source of inventories.values()) {
      const hasShared =
        source.label !== null ||
        source.resources.some((resource) => resource.scope.kind === "shared");
      if (hasShared || (source.error !== null && source.resources.length === 0))
        machines.push({
          id: `source:${source.pluginId}`,
          displayName:
            source.label ??
            sources.find((item) => item.pluginId === source.pluginId)
              ?.displayName ??
            source.pluginId,
          status: "connected",
          providers: [],
          error: source.error,
        });
      for (const resource of source.resources) {
        if (!enabledProviderIds.has(resource.providerId)) continue;
        const machineId =
          resource.scope.kind === "shared"
            ? `source:${source.pluginId}`
            : resource.scope.hostId;
        candidates.push({ source, resource, machineId });
      }
    }
    for (const machine of machines) {
      const visible = selectUsageResources(
        candidates.filter((candidate) => candidate.machineId === machine.id),
        ({ source, resource }) => ({
          ...resource,
          accountKey: measurements.has(keyOf(source.pluginId, resource.id))
            ? measurements.get(keyOf(source.pluginId, resource.id))!.value
                .accountKey
            : resource.accountKey,
        }),
      );
      for (const { source, resource } of visible) {
        const key = keyOf(source.pluginId, resource.id);
        const cached = measurements.get(key);
        machine.providers.push(
          resourceProvider(resource, cached?.value, source.pluginId, providers),
        );
        if (source.error !== null || failures.has(key))
          machine.error = "Some usage could not be refreshed.";
      }
      if (!machine.id.startsWith("source:")) {
        const covered = new Set(
          candidates
            .filter((candidate) => candidate.machineId === machine.id)
            .map((candidate) => candidate.resource.providerId),
        );
        for (const provider of hostProviders.get(machine.id) ?? []) {
          if (covered.has(provider.id)) continue;
          machine.providers.push({
            ...normalizedProvider(provider, undefined),
            usage: { status: "unsupported" },
          });
        }
      }
    }
    const providerOrder = new Map(
      providers.map((provider, index) => [provider.id, index]),
    );
    for (const machine of machines)
      machine.providers.sort(
        (a, b) =>
          (providerOrder.get(a.providerId) ?? Number.MAX_SAFE_INTEGER) -
          (providerOrder.get(b.providerId) ?? Number.MAX_SAFE_INTEGER),
      );
    return { machines };
  };
  const readLimits = async (input: z.infer<typeof limitsInputSchema>) => {
    const snapshot = await readUsage({ ...input, providerId: null }, true);
    if (input.machineIds !== null)
      snapshot.machines = snapshot.machines.filter((machine) =>
        input.machineIds!.includes(machine.id),
      );
    const observations = snapshot.machines.flatMap((machine) =>
      machine.providers.map((provider) => {
        const source = [...inventories.values()].find((source) =>
          source.resources.some(
            (resource) => `${source.pluginId}:${resource.id}` === provider.id,
          ),
        );
        const resource = source?.resources.find(
          (resource) => `${source.pluginId}:${resource.id}` === provider.id,
        );
        const key =
          source && resource ? keyOf(source.pluginId, resource.id) : null;
        const cached = key === null ? undefined : measurements.get(key);
        return {
          machineId: machine.id,
          resourceId: provider.id,
          observedAt: cached?.value.observedAt ?? null,
          fetchedAt: cached?.fetchedAt ?? null,
          refreshFailed:
            source?.error != null || (key !== null && failures.has(key)),
        };
      }),
    );
    return { snapshot, observations };
  };
  bb.rpc.register(
    providerUsageRpcContract,
    { getUsage: (request) => readUsage(request), readLimits },
    {
      experimental_discoverable: true,
      experimental_description:
        "Read subscription limits across enabled sources, shared accounts and machines. readLimits refreshes all eligible providers; getUsage retains lazy selected-provider behavior.",
    },
  );
  bb.agents.registerTool({
    name: "bb_usage_limits",
    description:
      "Read subscription usage and reset windows across enabled providers and pooled accounts. Unknown, unsupported and stale measurements are not zero or unlimited capacity. Machines are separate locations; never sum duplicate account quotas across locations.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      return JSON.stringify(
        await readLimits({ force: false, machineIds: null, maxAgeMs: 60_000 }),
      );
    },
  });
  bb.cli.register(
    defineCli({
      name: "usage",
      summary:
        "Inspect subscription usage across providers and pooled accounts",
      commands: {
        limits: cliCommand({
          summary:
            "Read all enabled provider limits, reset times and measurement freshness",
          options: {
            force: {
              type: "boolean",
              description:
                "Request fresh measurements instead of accepting recent cache",
            },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run(input) {
            const result = await readLimits({
              force: input.options.force ?? false,
              machineIds: null,
              maxAgeMs: 60_000,
            });
            return {
              exitCode: 0,
              stdout: JSON.stringify(
                result,
                null,
                input.options.json ? undefined : 2,
              ),
            };
          },
        }),
      },
    }),
  );
  const markDirty = () => {
    for (const value of measurements.values()) value.loadedAt = 0;
  };
  bb.events.on("thread.idle", markDirty);
  bb.events.on("thread.failed", markDirty);
}

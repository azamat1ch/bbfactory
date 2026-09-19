import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ProviderUsage,
  ProviderUsageResult,
  ProviderUsageWindow,
} from "@bb/provider-bridge-protocol";
import { clampPercent } from "@bb/provider-bridge-protocol/bridge-kit";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import type { AcpMaintenanceDialect } from "./provider-maintenance.js";

const USAGE_FETCH_TIMEOUT_MS = 15_000;
const DEVIN_DEFAULT_API_SERVER_URL = "https://server.codeium.com";
const DEVIN_GET_USER_STATUS_PATH =
  "/exa.seat_management_pb.SeatManagementService/GetUserStatus";
const DEVIN_USAGE_CLIENT = {
  ideName: "bb",
  ideVersion: "0.0.0",
  extensionName: "bb-provider-acp",
} as const;
const MAX_UNIX_SECONDS = 8_640_000_000_000;
const KNOWN_CONNECT_CODES: ReadonlySet<string> = new Set([
  "canceled",
  "unknown",
  "invalid_argument",
  "deadline_exceeded",
  "not_found",
  "already_exists",
  "permission_denied",
  "resource_exhausted",
  "failed_precondition",
  "aborted",
  "out_of_range",
  "unimplemented",
  "internal",
  "unavailable",
  "data_loss",
  "unauthenticated",
]);

let cachedExtensionVersion: string | undefined;
async function extensionVersion(): Promise<string> {
  if (cachedExtensionVersion !== undefined) return cachedExtensionVersion;
  try {
    const manifest: unknown = JSON.parse(
      await fs.readFile(new URL("../../package.json", import.meta.url), "utf8"),
    );
    const version = z
      .object({ version: z.string().min(1) })
      .safeParse(manifest);
    cachedExtensionVersion = version.success ? version.data.version : "0.0.0";
  } catch {
    cachedExtensionVersion = "0.0.0";
  }
  return cachedExtensionVersion;
}

function devinCredentialsFilePath(): string {
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "devin", "credentials.toml");
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "devin",
      "credentials.toml",
    );
  }
  const dataHome =
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "devin", "credentials.toml");
}

interface DevinCredentials {
  apiKey: string | null;
  apiServerUrl: string;
}

const devinCredentialsFileSchema = z.object({
  windsurf_api_key: z.string().min(1).optional(),
  api_server_url: z.string().url().optional(),
});

async function readDevinCredentials(): Promise<DevinCredentials> {
  let file: z.infer<typeof devinCredentialsFileSchema> = {};
  try {
    const parsed = devinCredentialsFileSchema.safeParse(
      parseToml(await fs.readFile(devinCredentialsFilePath(), "utf8")),
    );
    if (parsed.success) file = parsed.data;
  } catch {
    file = {};
  }
  const apiKey = process.env.WINDSURF_API_KEY ?? file.windsurf_api_key ?? null;
  const apiServerUrl =
    process.env.WINDSURF_API_SERVER_URL ??
    file.api_server_url ??
    DEVIN_DEFAULT_API_SERVER_URL;
  return { apiKey, apiServerUrl };
}

const devinQuotaPercentSchema = z.number().min(0).max(100);
const devinUnixSecondsSchema = z
  .union([
    z.number().int(),
    z
      .string()
      .regex(/^\d+$/u)
      .transform(Number),
  ])
  .refine(
    (value) =>
      Number.isSafeInteger(value) && value >= 0 && value <= MAX_UNIX_SECONDS,
  );

const devinPlanInfoSchema = z.object({
  planName: z.string().min(1).nullish(),
  teamsTier: z.string().min(1).nullish(),
  billingStrategy: z.string().min(1).nullish(),
  hideDailyQuota: z.boolean().nullish(),
  hideWeeklyQuota: z.boolean().nullish(),
  devinInfo: z.object({ orgId: z.string().min(1).nullish() }).nullish(),
});

const devinPlanStatusSchema = z.object({
  planInfo: devinPlanInfoSchema.nullish(),
  dailyQuotaRemainingPercent: devinQuotaPercentSchema.nullish(),
  weeklyQuotaRemainingPercent: devinQuotaPercentSchema.nullish(),
  dailyQuotaResetAtUnix: devinUnixSecondsSchema.nullish(),
  weeklyQuotaResetAtUnix: devinUnixSecondsSchema.nullish(),
});

const devinUserStatusResponseSchema = z.object({
  userStatus: z.object({
    email: z.string().email().nullish(),
    userId: z.string().min(1).nullish(),
    teamsTier: z.string().min(1).nullish(),
    planStatus: devinPlanStatusSchema.nullish(),
  }),
});

function devinUsageError(
  message: string,
  fields: { planLabel?: string | null; accountEmail?: string | null } = {},
): ProviderUsage {
  return {
    status: "error",
    message,
    planLabel: fields.planLabel ?? null,
    accountEmail: fields.accountEmail ?? null,
  };
}

function quotaWindow(args: {
  label: string;
  kind: "daily" | "weekly";
  remainingPercent: number;
  resetAtUnix: number | null | undefined;
}): ProviderUsageWindow {
  return {
    label: args.label,
    kind: args.kind,
    usedPercent: clampPercent(100 - args.remainingPercent),
    resetsAt:
      args.resetAtUnix == null || args.resetAtUnix === 0
        ? null
        : new Date(args.resetAtUnix * 1000).toISOString(),
  };
}

function normalizeDevinUsage(raw: unknown): ProviderUsage {
  const parsed = devinUserStatusResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return devinUsageError("Devin usage response was malformed.");
  }
  const userStatus = parsed.data.userStatus;
  const planStatus = userStatus.planStatus ?? null;
  const planInfo = planStatus?.planInfo ?? null;
  const accountEmail = userStatus.email ?? null;
  const planLabel = planInfo?.planName ?? null;
  if (planStatus === null || planInfo === null) {
    return devinUsageError(
      "Devin did not report quota usage for this account.",
      { planLabel, accountEmail },
    );
  }
  if (planInfo.billingStrategy !== "BILLING_STRATEGY_QUOTA") {
    return devinUsageError(
      "Devin account does not report daily/weekly quota usage.",
      { planLabel, accountEmail },
    );
  }
  const orgId = planInfo.devinInfo?.orgId ?? null;
  const userId = userStatus.userId ?? null;
  const teamsTier = planInfo.teamsTier ?? userStatus.teamsTier ?? null;
  const windows: ProviderUsageWindow[] = [];
  if (planInfo.hideDailyQuota !== true) {
    windows.push(
      quotaWindow({
        label: "Daily quota",
        kind: "daily",
        remainingPercent: planStatus.dailyQuotaRemainingPercent ?? 0,
        resetAtUnix: planStatus.dailyQuotaResetAtUnix,
      }),
    );
  }
  if (planInfo.hideWeeklyQuota !== true) {
    windows.push(
      quotaWindow({
        label: "Weekly quota",
        kind: "weekly",
        remainingPercent: planStatus.weeklyQuotaRemainingPercent ?? 0,
        resetAtUnix: planStatus.weeklyQuotaResetAtUnix,
      }),
    );
  }
  return {
    status: "ok",
    accountEmail,
    planLabel,
    windows,
    accountKey:
      orgId !== null && userId !== null ? `devin:${orgId}:${userId}` : null,
    plan: teamsTier === null ? null : { id: teamsTier, multiplier: null },
  };
}

const connectErrorSchema = z.object({ code: z.string().min(1) });

async function readDevinUsageWithDeps(deps: {
  credentials(): Promise<DevinCredentials>;
  fetchFn?: typeof fetch;
  clientVersion?: string;
}): Promise<ProviderUsageResult> {
  const credentials = await deps.credentials();
  if (credentials.apiKey === null) {
    return { supported: true, usage: { status: "unauthenticated" } };
  }
  const fetchImpl = deps.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(
      `${credentials.apiServerUrl}${DEVIN_GET_USER_STATUS_PATH}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
        },
        body: JSON.stringify({
          metadata: {
            apiKey: credentials.apiKey,
            ...DEVIN_USAGE_CLIENT,
            extensionVersion:
              deps.clientVersion ?? (await extensionVersion()),
          },
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(USAGE_FETCH_TIMEOUT_MS),
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      supported: true,
      usage: devinUsageError(
        timedOut
          ? "Devin usage request timed out."
          : "Devin usage request failed.",
      ),
    };
  }
  if (response.status === 401 || response.status === 403) {
    return { supported: true, usage: { status: "expired" } };
  }
  if (!response.ok) {
    const parsedError = connectErrorSchema.safeParse(
      await response.json().catch(() => null),
    );
    const code =
      parsedError.success && KNOWN_CONNECT_CODES.has(parsedError.data.code)
        ? parsedError.data.code
        : null;
    if (code === "unauthenticated") {
      return { supported: true, usage: { status: "expired" } };
    }
    return {
      supported: true,
      usage: devinUsageError(
        `Devin usage request failed (HTTP ${response.status}${
          code === null ? "" : `, ${code}`
        }).`,
      ),
    };
  }
  const body: unknown = await response.json().catch(() => undefined);
  return { supported: true, usage: normalizeDevinUsage(body) };
}

async function readDevinUsage(): Promise<ProviderUsageResult> {
  return readDevinUsageWithDeps({ credentials: readDevinCredentials });
}

export const DEVIN_ACP_MAINTENANCE: AcpMaintenanceDialect = {
  loginCommand: "devin auth login",
  readAccount: async () => {
    const { apiKey } = await readDevinCredentials();
    return apiKey === null ? null : { email: null };
  },
  readUsage: readDevinUsage,
};

export const __devinTesting = {
  normalizeDevinUsage,
  readDevinUsageWithDeps,
  readDevinCredentials,
  devinCredentialsFilePath,
};

import { describe, expect, it, vi } from "vitest";
import {
  DEVIN_ACP_MAINTENANCE,
  __devinTesting,
} from "./provider-maintenance-devin.js";

const { normalizeDevinUsage, readDevinUsageWithDeps } = __devinTesting;

interface DevinStatusFixture {
  userStatus: {
    email?: string;
    userId?: string;
    teamsTier?: string;
    planStatus?: {
      planInfo?: {
        planName?: string;
        teamsTier?: string;
        billingStrategy?: string;
        hideDailyQuota?: boolean;
        hideWeeklyQuota?: boolean;
        devinInfo?: { orgId?: string };
      };
      planStart?: string;
      planEnd?: string;
      dailyQuotaRemainingPercent?: number;
      weeklyQuotaRemainingPercent?: number;
      dailyQuotaResetAtUnix?: number | string;
      weeklyQuotaResetAtUnix?: number | string;
    };
  };
}

const VALID_RESPONSE: DevinStatusFixture = {
  userStatus: {
    email: "devin@example.com",
    userId: "user-123",
    teamsTier: "TEAMS_TIER_DEVIN_PRO",
    planStatus: {
      planInfo: {
        planName: "Pro",
        teamsTier: "TEAMS_TIER_DEVIN_PRO",
        billingStrategy: "BILLING_STRATEGY_QUOTA",
        devinInfo: { orgId: "org-456" },
      },
      planStart: "2026-09-19T11:06:32Z",
      planEnd: "2026-10-19T11:06:32Z",
      dailyQuotaRemainingPercent: 100,
      weeklyQuotaRemainingPercent: 80.5,
      dailyQuotaResetAtUnix: "1789891200",
      weeklyQuotaResetAtUnix: 1790054400,
    },
  },
};

function credentials(apiKey: string | null = "devin-test-key") {
  return async () => ({
    apiKey,
    apiServerUrl: "https://server.example.test",
  });
}

function fetchReturning(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe("normalizeDevinUsage", () => {
  it("maps verified daily and weekly quota fields to windows", () => {
    expect(normalizeDevinUsage(VALID_RESPONSE)).toEqual({
      status: "ok",
      accountEmail: "devin@example.com",
      planLabel: "Pro",
      windows: [
        {
          label: "Daily quota",
          kind: "daily",
          usedPercent: 0,
          resetsAt: "2026-09-20T08:00:00.000Z",
        },
        {
          label: "Weekly quota",
          kind: "weekly",
          usedPercent: 20,
          resetsAt: "2026-09-22T05:20:00.000Z",
        },
      ],
      accountKey: "devin:org-456:user-123",
      plan: { id: "TEAMS_TIER_DEVIN_PRO", multiplier: null },
    });
  });

  it("applies protobuf omitted-field defaults on quota plans", () => {
    const exhausted = structuredClone(VALID_RESPONSE);
    delete exhausted.userStatus.planStatus?.dailyQuotaRemainingPercent;
    delete exhausted.userStatus.planStatus?.weeklyQuotaRemainingPercent;
    delete exhausted.userStatus.planStatus?.dailyQuotaResetAtUnix;
    exhausted.userStatus.planStatus!.weeklyQuotaResetAtUnix = "0";
    expect(normalizeDevinUsage(exhausted)).toMatchObject({
      status: "ok",
      windows: [
        {
          label: "Daily quota",
          kind: "daily",
          usedPercent: 100,
          resetsAt: null,
        },
        {
          label: "Weekly quota",
          kind: "weekly",
          usedPercent: 100,
          resetsAt: null,
        },
      ],
    });
  });

  it("honors hidden quota windows like the official client", () => {
    const hiddenDaily = structuredClone(VALID_RESPONSE);
    hiddenDaily.userStatus.planStatus!.planInfo!.planName = "Max";
    hiddenDaily.userStatus.planStatus!.planInfo!.hideDailyQuota = true;
    expect(normalizeDevinUsage(hiddenDaily)).toMatchObject({
      status: "ok",
      planLabel: "Max",
      windows: [{ label: "Weekly quota", kind: "weekly" }],
    });
    const allHidden = structuredClone(VALID_RESPONSE);
    allHidden.userStatus.planStatus!.planInfo!.hideDailyQuota = true;
    allHidden.userStatus.planStatus!.planInfo!.hideWeeklyQuota = true;
    expect(normalizeDevinUsage(allHidden)).toMatchObject({
      status: "ok",
      windows: [],
    });
  });

  it("reports an error when the plan carries no quota contract", () => {
    const noPlanStatus = structuredClone(VALID_RESPONSE);
    delete noPlanStatus.userStatus.planStatus;
    expect(normalizeDevinUsage(noPlanStatus)).toMatchObject({
      status: "error",
      message: "Devin did not report quota usage for this account.",
    });
    const noPlanInfo = structuredClone(VALID_RESPONSE);
    delete noPlanInfo.userStatus.planStatus?.planInfo;
    expect(normalizeDevinUsage(noPlanInfo).status).toBe("error");
    const nonQuota = structuredClone(VALID_RESPONSE);
    nonQuota.userStatus.planStatus!.planInfo!.billingStrategy =
      "BILLING_STRATEGY_CREDITS";
    expect(normalizeDevinUsage(nonQuota)).toMatchObject({
      status: "error",
      message: "Devin account does not report daily/weekly quota usage.",
      planLabel: "Pro",
      accountEmail: "devin@example.com",
    });
  });

  it("rejects malformed and out-of-range values instead of guessing", () => {
    expect(normalizeDevinUsage({})).toMatchObject({
      status: "error",
      message: "Devin usage response was malformed.",
    });
    for (const value of [140, -5, "high"]) {
      const bad = structuredClone(VALID_RESPONSE);
      bad.userStatus.planStatus!.dailyQuotaRemainingPercent = value as never;
      expect(normalizeDevinUsage(bad).status).toBe("error");
    }
    for (const reset of ["99999999999999999999999", -1, "soon"]) {
      const bad = structuredClone(VALID_RESPONSE);
      bad.userStatus.planStatus!.dailyQuotaResetAtUnix = reset as never;
      expect(normalizeDevinUsage(bad).status).toBe("error");
    }
  });

  it("keeps accountKey null unless org and seat identity are both present", () => {
    const noOrg = structuredClone(VALID_RESPONSE);
    delete noOrg.userStatus.planStatus?.planInfo?.devinInfo;
    expect(normalizeDevinUsage(noOrg).accountKey).toBeNull();
    const noUser = structuredClone(VALID_RESPONSE);
    delete noUser.userStatus.userId;
    expect(normalizeDevinUsage(noUser).accountKey).toBeNull();
    const noPlan = structuredClone(VALID_RESPONSE);
    delete noPlan.userStatus.planStatus?.planInfo?.teamsTier;
    delete noPlan.userStatus.teamsTier;
    const result = normalizeDevinUsage(noPlan);
    expect(result).toMatchObject({ status: "ok", plan: null });
  });
});

describe("readDevinUsage", () => {
  it("posts Connect JSON with the stored key and does not follow redirects", async () => {
    const fetchImpl = fetchReturning(
      new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }),
    );
    const result = await readDevinUsageWithDeps({
      credentials: credentials(),
      fetchFn: fetchImpl,
      clientVersion: "0.1.0",
    });
    expect(result).toMatchObject({ supported: true, usage: { status: "ok" } });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://server.example.test/exa.seat_management_pb.SeatManagementService/GetUserStatus",
    );
    expect(init.redirect).toBe("manual");
    const body = JSON.parse(String(init.body)) as {
      metadata: Record<string, string>;
    };
    expect(body.metadata).toMatchObject({
      apiKey: "devin-test-key",
      ideName: "bb",
      extensionName: "bb-provider-acp",
      extensionVersion: "0.1.0",
    });
  });

  it("reports unauthenticated without a stored key and never calls the API", async () => {
    const fetchImpl = fetchReturning(new Response("{}", { status: 200 }));
    const result = await readDevinUsageWithDeps({
      credentials: credentials(null),
      fetchFn: fetchImpl,
    });
    expect(result).toEqual({
      supported: true,
      usage: { status: "unauthenticated" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps only real auth rejections to expired", async () => {
    for (const status of [401, 403]) {
      const result = await readDevinUsageWithDeps({
        credentials: credentials(),
        fetchFn: fetchReturning(new Response("{}", { status })),
      });
      expect(result).toEqual({
        supported: true,
        usage: { status: "expired" },
      });
    }
    const unauthenticated = await readDevinUsageWithDeps({
      credentials: credentials(),
      fetchFn: fetchReturning(
        new Response(JSON.stringify({ code: "unauthenticated" }), {
          status: 400,
        }),
      ),
    });
    expect(unauthenticated).toEqual({
      supported: true,
      usage: { status: "expired" },
    });
  });

  it("keeps request rejections and redirects as errors, never expired", async () => {
    const rejected = await readDevinUsageWithDeps({
      credentials: credentials(),
      fetchFn: fetchReturning(
        new Response(
          JSON.stringify({
            code: "invalid_argument",
            message: "an internal error occurred (trace ID: abc)",
          }),
          { status: 400 },
        ),
      ),
    });
    expect(rejected).toEqual({
      supported: true,
      usage: {
        status: "error",
        message: "Devin usage request failed (HTTP 400, invalid_argument).",
        planLabel: null,
        accountEmail: null,
      },
    });
    const redirected = await readDevinUsageWithDeps({
      credentials: credentials(),
      fetchFn: fetchReturning(new Response("", { status: 302 })),
    });
    expect(redirected).toMatchObject({
      supported: true,
      usage: { status: "error", message: expect.stringContaining("302") },
    });
  });

  it("sanitizes transport failures so credentials never leak into errors", async () => {
    const leaky = await readDevinUsageWithDeps({
      credentials: credentials("devin-secret-key-123"),
      fetchFn: (async () => {
        throw new Error("fetch failed for key devin-secret-key-123");
      }) as unknown as typeof fetch,
    });
    expect(leaky).toEqual({
      supported: true,
      usage: {
        status: "error",
        message: "Devin usage request failed.",
        planLabel: null,
        accountEmail: null,
      },
    });
    const timedOut = await readDevinUsageWithDeps({
      credentials: credentials("devin-secret-key-123"),
      fetchFn: (async () => {
        throw Object.assign(new Error("timed out"), {
          name: "TimeoutError",
        });
      }) as unknown as typeof fetch,
    });
    expect(timedOut).toMatchObject({
      usage: {
        status: "error",
        message: "Devin usage request timed out.",
      },
    });
  });

  it("reports malformed success bodies as errors", async () => {
    const result = await readDevinUsageWithDeps({
      credentials: credentials(),
      fetchFn: fetchReturning(new Response("not json", { status: 200 })),
    });
    expect(result).toMatchObject({
      supported: true,
      usage: {
        status: "error",
        message: "Devin usage response was malformed.",
      },
    });
  });
});

describe("Devin maintenance dialect", () => {
  it("exposes no installer and treats stored credentials as authentication", async () => {
    expect(DEVIN_ACP_MAINTENANCE.installer).toBeUndefined();
    expect(DEVIN_ACP_MAINTENANCE.loginCommand).toBe("devin auth login");
    vi.stubEnv("WINDSURF_API_KEY", "devin-test-key");
    try {
      expect(await DEVIN_ACP_MAINTENANCE.readAccount()).toEqual({
        email: null,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

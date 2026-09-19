import { describe, expect, it } from "vitest";
import { DEVIN_ACP_MAINTENANCE } from "./provider-maintenance-devin.js";
import {
  CURSOR_ACP_MAINTENANCE,
  __testing,
  getAcpProviderHealth,
  getAcpProviderInstallationRun,
  getAcpProviderInstallationStatus,
} from "./provider-maintenance.js";

function cursorMissingInstallationStatus() {
  return {
    executableName: "cursor-agent",
    executablePath: null,
    installed: false,
    installSource: "notInstalled" as const,
    currentVersion: null,
    latestVersion: null,
    minimumSupportedVersion: null,
    npmPackageName: null,
    npmGlobalPackageVersion: null,
    installAction: {
      kind: "install" as const,
      label: "Install" as const,
      command: "install Cursor",
    },
    needsUpdate: false,
    versionUnsupported: false,
  };
}

describe("ACP provider maintenance", () => {
  it("normalizes Cursor plan and spend limits without reading daemon state", () => {
    expect(
      __testing.normalizeUsage(
        {
          billingCycleEnd: "1767225600000",
          planUsage: { totalPercentUsed: 72.2 },
          spendLimitUsage: {
            overallUsed: "1250",
            overallLimit: "5000",
          },
        },
        { planInfo: { planName: "Pro" } },
        "cursor@example.com",
      ),
    ).toEqual({
      status: "ok",
      accountEmail: "cursor@example.com",
      planLabel: "Pro",
      windows: [
        {
          label: "Plan usage",
          usedPercent: 72,
          resetsAt: "2026-01-01T00:00:00.000Z",
        },
        {
          label: "On-demand spend",
          usedPercent: 25,
          resetsAt: "2026-01-01T00:00:00.000Z",
          cost: { usedUsdCents: 1250, limitUsdCents: 5000 },
        },
      ],
    });
  });

  it("offers the installer only through a fresh matching action", () => {
    expect(
      __testing.buildProviderInstallationRun(
        cursorMissingInstallationStatus(),
        {
          maintenance: CURSOR_ACP_MAINTENANCE,
          command: "cursor-agent",
          action: "install",
        },
      ),
    ).toMatchObject({
      available: true,
      command: { command: "sh" },
      verification: { kind: "installed" },
    });
    expect(
      __testing.buildProviderInstallationRun(
        { ...cursorMissingInstallationStatus(), installAction: null },
        { maintenance: undefined, command: "opencode", action: "install" },
      ),
    ).toEqual({
      available: false,
      message: "opencode install is not available on this host.",
    });
    expect(
      __testing.buildProviderInstallationRun(
        cursorMissingInstallationStatus(),
        {
          maintenance: undefined,
          command: "opencode",
          action: "install",
        },
      ),
    ).toEqual({
      available: false,
      message: "opencode install is not available on this host.",
    });
  });

  it("does not offer install actions for maintenance dialects without an installer", async () => {
    const devinHealth = await getAcpProviderHealth({
      maintenance: DEVIN_ACP_MAINTENANCE,
      command: null,
    });
    expect(devinHealth).toMatchObject({
      supported: true,
      health: {
        canInstall: false,
        canUpdate: false,
        loginCommand: "devin auth login",
      },
    });
    const cursorHealth = await getAcpProviderHealth({
      maintenance: CURSOR_ACP_MAINTENANCE,
      command: null,
    });
    expect(cursorHealth).toMatchObject({
      supported: true,
      health: { canInstall: true, canUpdate: true },
    });
    const missing = "bb-test-definitely-not-installed";
    const devinStatus = await getAcpProviderInstallationStatus({
      maintenance: DEVIN_ACP_MAINTENANCE,
      command: missing,
    });
    expect(devinStatus).toMatchObject({ installed: false, installAction: null });
    const cursorStatus = await getAcpProviderInstallationStatus({
      maintenance: CURSOR_ACP_MAINTENANCE,
      command: missing,
    });
    expect(cursorStatus.installAction).not.toBeNull();
    const devinRun = await getAcpProviderInstallationRun({
      maintenance: DEVIN_ACP_MAINTENANCE,
      command: missing,
      action: "install",
    });
    expect(devinRun).toEqual({
      available: false,
      message: `${missing} install is not available on this host.`,
    });
  });
});

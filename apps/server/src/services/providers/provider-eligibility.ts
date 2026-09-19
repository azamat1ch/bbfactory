import { getAppSettings, setAppSettings } from "@bb/db";
import type { DbConnection } from "@bb/db";
import { ApiError } from "../../errors.js";

export function isProviderEnabled(
  db: DbConnection,
  providerId: string,
): boolean {
  return !getAppSettings(db).disabledProviderIds.includes(providerId);
}

export function requireProviderEnabled(
  db: DbConnection,
  providerId: string,
): void {
  if (isProviderEnabled(db, providerId)) return;
  throw new ApiError(
    409,
    "provider_disabled",
    `Provider '${providerId}' is disabled. Enable it in Settings → Providers before starting new work.`,
  );
}

export function setProviderEnabled(
  db: DbConnection,
  providerId: string,
  enabled: boolean,
): void {
  const settings = getAppSettings(db);
  const disabledProviderIds = settings.disabledProviderIds.filter(
    (id) => id !== providerId,
  );
  setAppSettings(db, {
    ...settings,
    disabledProviderIds: enabled
      ? disabledProviderIds
      : [...disabledProviderIds, providerId],
  });
}

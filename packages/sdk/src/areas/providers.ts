import type {
  SystemExecutionOptionsResponse,
  SystemProviderInfo,
  SystemProvidersQuery,
} from "@bb/server-contract";
import {
  readExecutionOptions,
  signalRequestArgs,
  type CreateSdkAreaArgs,
} from "./common.js";

export type ProviderHostRoutingArgs =
  | { environmentId: string; hostId?: never }
  | { environmentId?: never; hostId: string }
  | { environmentId?: never; hostId?: never };

export type ProviderListArgs = ProviderHostRoutingArgs & {
  capability?: SystemProvidersQuery["capability"];
  includeDisabled?: boolean;
  signal?: AbortSignal;
};
export type ProviderModelsArgs = ProviderHostRoutingArgs & {
  providerId?: string;
  signal?: AbortSignal;
};

export type ProviderListResult = SystemProviderInfo[];
export type ProviderModelsResult = SystemExecutionOptionsResponse;

export interface ProvidersArea {
  list(args?: ProviderListArgs): Promise<ProviderListResult>;
  models(args?: ProviderModelsArgs): Promise<ProviderModelsResult>;
  experimental_setEnabled(args: {
    providerId: string;
    enabled: boolean;
    signal?: AbortSignal;
  }): Promise<{ providerId: string; enabled: boolean }>;
}

export function createProvidersArea(args: CreateSdkAreaArgs): ProvidersArea {
  const { transport } = args;
  return {
    async list(input = {}) {
      return transport.readJson(
        transport.api.v1.system.providers.$get(
          {
            query: {
              ...(input.capability === undefined
                ? {}
                : { capability: input.capability }),
              ...(input.includeDisabled === undefined
                ? {}
                : {
                    includeDisabled: input.includeDisabled ? "true" : "false",
                  }),
              ...(input.environmentId === undefined
                ? {}
                : { environmentId: input.environmentId }),
              ...(input.hostId === undefined ? {} : { hostId: input.hostId }),
            },
          },
          ...signalRequestArgs(input.signal),
        ),
      );
    },
    async models(input = {}) {
      return readExecutionOptions(transport, input);
    },
    async experimental_setEnabled(input) {
      return transport.readJson(
        transport.api.v1.system.providers[":id"].enabled.$put(
          {
            param: { id: input.providerId },
            json: { enabled: input.enabled },
          },
          ...signalRequestArgs(input.signal),
        ),
      );
    },
  };
}

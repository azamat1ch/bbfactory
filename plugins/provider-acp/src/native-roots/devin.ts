import path from "node:path";
import type {
  AcpNativeRootsEnvironment,
  AcpNativeRootsResolver,
} from "./resolver.js";
import { resolveStoredPath, skillsRoot } from "./shared.js";

export function resolveDevinConfigHome(
  homeDir: string,
  env: AcpNativeRootsEnvironment,
): string {
  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim();
  return xdgConfigHome
    ? resolveStoredPath(homeDir, xdgConfigHome)
    : path.join(homeDir, ".config");
}

export const resolveDevinNativeRoots: AcpNativeRootsResolver = async (args) => {
  const configHome = resolveDevinConfigHome(args.homeDir, args.env);
  return {
    skills: [
      skillsRoot({
        origin: "user",
        path: path.join(configHome, "devin", "skills"),
        recursive: false,
      }),
      skillsRoot({
        origin: "user",
        path: path.join(configHome, "cognition", "skills"),
        recursive: false,
      }),
    ],
  };
};

import { cp, rm } from "node:fs/promises";
const target = new URL("../skills/pragmatic-orchestration", import.meta.url);
await rm(target, { recursive: true, force: true });
await cp(new URL("../../factory-guidance/skills/pragmatic-orchestration", import.meta.url), target, { recursive: true });

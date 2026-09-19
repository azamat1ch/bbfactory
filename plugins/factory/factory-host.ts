import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import tasks from "./tasks/host.js";
import execution from "./execution/host.js";

export default experimental_defineHostEntry({
  contract: { ...tasks.contract, ...execution.contract },
  handlers: { ...tasks.handlers, ...execution.handlers },
});

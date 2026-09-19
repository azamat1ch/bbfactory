import { registerExecutionUi } from "./execution/app.js";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { registerFactoryTeamUi } from "./team/app.js";
import { registerFactoryTaskUi } from "./tasks/app.js";

export default definePluginApp((app) => {
  registerExecutionUi(app);
  registerFactoryTeamUi(app);
  registerFactoryTaskUi(app);
});

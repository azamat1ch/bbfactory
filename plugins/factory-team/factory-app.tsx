import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { registerFactoryTeamUi } from "./app.js";
import { registerFactoryTaskUi } from "../bbfactory/src/app.js";

export default definePluginApp((app) => {
  registerFactoryTeamUi(app);
  registerFactoryTaskUi(app);
});

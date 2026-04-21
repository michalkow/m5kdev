import { defineBackendModule, defineBackendModules } from "@m5kdev/backend/app";
import {
  authBackendModule,
  notificationBackendModule,
  postsBackendModule,
  workflowBackendModule,
} from "./modules";

export const emailSchemaModule = defineBackendModule({
  id: "email",
});

export const backendSchemaModules = defineBackendModules([
  emailSchemaModule,
  authBackendModule,
  workflowBackendModule,
  notificationBackendModule,
  postsBackendModule,
] as const);

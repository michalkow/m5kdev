import { builtBackendApp } from "./app";

export const workflowService = builtBackendApp.modules.workflow.services.workflow;
export const workflowRegistry = builtBackendApp.workflow!.registry;

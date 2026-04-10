import { builtBackendApp } from "./app";

export const authRepository = builtBackendApp.modules.auth.repositories.auth;
export const workflowRepository = builtBackendApp.modules.workflow.repositories.workflow;
export const notificationRepository = builtBackendApp.modules.notification.repositories.notification;
export const postsRepository = builtBackendApp.modules.posts.repositories.posts;

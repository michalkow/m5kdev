import { builtBackendApp, emailService } from "./app";

export { emailService };

export const authService = builtBackendApp.modules.auth.services.auth;
export const postsService = builtBackendApp.modules.posts.services.posts;
export const notificationService = builtBackendApp.modules.notification.services.notification;

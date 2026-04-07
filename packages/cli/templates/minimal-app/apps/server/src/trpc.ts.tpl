import { createNotificationTRPC } from "@m5kdev/backend/modules/notification/notification.trpc";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { notificationService } from "./service";
import { postsRouter as posts } from "./modules/posts/posts.trpc";
import { router, trpcObject } from "./utils/trpc";

const notification = createNotificationTRPC(trpcObject, notificationService);

export const appRouter = router({
  posts,
  notification,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

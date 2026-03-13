import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { postsRouter as posts } from "./modules/posts/posts.trpc";
import { router } from "./utils/trpc";

export const appRouter = router({
  posts,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

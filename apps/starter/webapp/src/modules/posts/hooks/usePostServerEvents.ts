import type { ServerEventHandler } from "@m5kdev/frontend";
import { useServerEventHandler } from "@m5kdev/frontend/modules/app/hooks/useServerEventHandler";
import { POST_SERVER_EVENT_RESOURCE } from "@starter-app/shared/modules/posts/posts.constants";
import { useTRPC } from "@/utils/trpc";

export function createPostListServerEventHandler(
  trpc: ReturnType<typeof useTRPC>
): ServerEventHandler {
  return (_event, queryClient) => {
    void queryClient.invalidateQueries(trpc.posts.list.queryFilter());
  };
}

/** Keep the posts list live while this route is mounted. */
export function usePostServerEvents(): void {
  const trpc = useTRPC();
  useServerEventHandler({
    resource: POST_SERVER_EVENT_RESOURCE,
    handler: createPostListServerEventHandler(trpc),
  });
}

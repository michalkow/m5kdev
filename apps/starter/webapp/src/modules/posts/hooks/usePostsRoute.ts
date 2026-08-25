import { usePostActions } from "./usePostActions";
import { usePostsList } from "./usePostsList";

/**
 * Screen-level hook for the posts route: composes the list query/URL state and
 * the reusable post actions so the route component makes a single call.
 */
export function usePostsRoute() {
  const list = usePostsList();
  const actions = usePostActions();

  return { ...list, ...actions };
}

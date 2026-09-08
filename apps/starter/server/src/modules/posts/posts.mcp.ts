import { defineMcpCall } from "@m5kdev/backend/modules/mcp/mcp.define";
import type { McpOrganizationCallDefinition } from "@m5kdev/backend/modules/mcp/mcp.types";
import { postSchemas } from "./posts.dto";
import type { PostsService } from "./posts.service";

export function createPostsMcp(posts: PostsService): Record<string, McpOrganizationCallDefinition> {
  return {
    "list-posts": defineMcpCall()
      .description("List posts in the selected Organization")
      .input(postSchemas.input.list)
      .handle(async (input, actor) => posts.list(input, { actor, user: { id: actor.userId } })),
    "create-post": defineMcpCall()
      .description("Create a draft post in the selected Organization")
      .input(postSchemas.input.create)
      .handle(async (input, actor) => posts.create(input, { actor, user: { id: actor.userId } })),
  };
}

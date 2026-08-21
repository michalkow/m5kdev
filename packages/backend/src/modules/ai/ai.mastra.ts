import { Mastra } from "@mastra/core";
import {
  Agent,
  type AgentConfig,
  type AgentEditorConfig,
  type ToolsInput,
} from "@mastra/core/agent";
import { LibSQLStore, LibSQLVector } from "@mastra/libsql";

export function createAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, any> | unknown = unknown,
  TEditor extends AgentEditorConfig | undefined = AgentEditorConfig | undefined,
>(
  params: AgentConfig<TAgentId, TTools, TOutput, TRequestContext, TEditor>
): Agent<TAgentId, TTools, TOutput, TRequestContext, TEditor> {
  return new Agent({
    instructions: ({ requestContext }) => {
      const instructions = requestContext.get("agent-instructions");
      if (!instructions || typeof instructions !== "string") return "You are a helpful assistant.";
      return instructions;
    },
    model: ({ requestContext }) => {
      const model = requestContext.get("agent-model");
      if (!model || typeof model !== "string") throw new Error("Mastra Agent: Model is required");
      return model;
    },
    tools: ({ requestContext }) => {
      const tools = requestContext.get("agent-tools");
      if (!tools || typeof tools !== "object") return {};
      return tools;
    },
    ...params,
  });
}

export function createMastra(agents: Record<string, Agent>) {
  return new Mastra({
    agents,
    storage: new LibSQLStore({
      id: "mastra-main",
      url: process.env.MASTRA_MAIN_DATABASE_URL ?? "file:./mastra-main.db",
    }),
    vectors: {
      main: new LibSQLVector({
        // TODO: force always remote database on production, only allow file in development
        id: "mastra-vector",
        url: process.env.MASTRA_VECTOR_DATABASE_URL ?? "file:./mastra-vector.db",
      }),
    },
  });
}

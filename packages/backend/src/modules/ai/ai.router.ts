// import { openai } from "@ai-sdk/openai";
// import { open}
// import { withTracing } from "@posthog/ai";
// import {
//   appendClientMessage,
//   appendResponseMessages,
//   type Message,
//   streamText,
//   type Tool,
// } from "ai";
// import bodyParser from "body-parser";
// import { and, eq } from "drizzle-orm";
// import express, { type Response, type Router } from "express";
// import { v4 as uuidv4 } from "uuid";
// import type { AuthRequest, createAuthMiddleware } from "../auth/auth.middleware";
// import { type Orm, schema } from "../db";
// import { logger } from "../logger";
// import { posthogClient } from "../posthog";

// export type Tooling = Record<
//   string,
//   {
//     getMesseges: (chatId: string) => Promise<Message[]>;
//     getTools: (chatId: string) => Promise<
//       Record<
//         string,
//         {
//           tool: Tool;
//           handler?: (
//             chatId: string,
//             args: unknown,
//             user: NonNullable<AuthRequest["user"]>
//           ) => Promise<void>;
//         }
//       >
//     >;
//   }
// >;

// export function tracedOpenAiModel(
//   model: Parameters<typeof openai>[0],
//   clientOptions: Parameters<typeof withTracing>[2]
// ) {
//   return withTracing(openai(model), posthogClient, clientOptions);
// }

// async function getRouteSettings(id: string, name: string, settings: Tooling) {
//   const entity = settings[name as keyof typeof settings];
//   if (!entity) return { tools: {}, entityMesseges: [], entityTools: {} };

//   const entityTools = await entity.getTools(id);
//   const entityMesseges = await entity.getMesseges(id);

//   const tools = Object.entries(entityTools).reduce<
//     Record<string, (typeof entityTools)[keyof typeof entityTools]["tool"]>
//   >((acc, [key, value]) => {
//     acc[key] = value.tool as (typeof entityTools)[keyof typeof entityTools]["tool"];
//     return acc;
//   }, {});

//   return { tools, entityMesseges, entityTools };
// }

// export function createAiRouter(
//   orm: Orm,
//   authMiddleware: ReturnType<typeof createAuthMiddleware>,
//   settings: Tooling
// ) {
//   const aiRouter: Router = express.Router();

//   aiRouter.use(bodyParser.json());

//   aiRouter.post("/completion/:name", authMiddleware, async (req: AuthRequest, res: Response) => {
//     try {
//       const { id, message } = req.body as {
//         id: string;
//         message: Message;
//       };
//       logger.info(req.body, "body");
//       const { name } = req.params;
//       const user = req.user!;
//       logger.info(message, "Received message:");

//       const { tools, entityMesseges, entityTools } = await getRouteSettings(id, name, settings);

//       const [chat] = await orm
//         .select()
//         .from(schema.chats)
//         .where(and(eq(schema.chats.id, id), eq(schema.chats.userId, user.id)));
//       if (!chat) throw new Error("Chat not found");

//       const messages = appendClientMessage({
//         messages: (chat.conversation || []) as Message[],
//         message,
//       });

//       // Process any tool invocations in the message
//       const toolInvocation = message?.parts?.find((p) => p.type === "tool-invocation");

//       if (toolInvocation) {
//         logger.info(toolInvocation, "Processing tool invocation:");
//         const tool =
//           entityTools[toolInvocation.toolInvocation.toolName as keyof typeof entityTools];
//         if (tool?.handler) {
//           const result = await tool.handler(id, toolInvocation.toolInvocation.args, user);
//           logger.info({ result }, "Tool handler result:");
//         }
//       }

//       logger.info([...entityMesseges, ...messages], "Processed messages");

//       const result = streamText({
//         model: tracedOpenAiModel("gpt-4o", {
//           posthogDistinctId: user.id,
//           posthogProperties: { conversation_id: id, paid: true },
//           posthogPrivacyMode: false,
//         }),
//         experimental_generateMessageId: uuidv4,
//         messages: [...entityMesseges, ...messages],
//         async onFinish({ response }) {
//           logger.info(response, "Final response:");
//           try {
//             await orm
//               .update(schema.chats)
//               .set({
//                 conversation: appendResponseMessages({
//                   messages,
//                   responseMessages: response.messages,
//                 }),
//               })
//               .where(eq(schema.chats.id, id));
//           } catch (error) {
//             logger.error("Error in onFinish handler:", error);
//           }
//         },
//         tools,
//       });

//       result.consumeStream();
//       result.pipeDataStreamToResponse(res);
//     } catch (error) {
//       logger.error(error, "Error in ai handler");
//       res.status(500).send({ error: "Internal Server Error" });
//     }
//   });

//   return aiRouter;
// }

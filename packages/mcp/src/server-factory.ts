import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ContextToolHandler } from "./handler.js";
import { contextToolInputSchema, sanitizedToolError } from "./handler.js";

export function createLoxoraMcpServer(handler: ContextToolHandler): McpServer {
  const server = new McpServer({ name: "loxora", version: "0.0.0" });
  server.registerTool(
    "loxora_get_context",
    {
      title: "Build Loxora Context Package",
      description: "Build deterministic lifecycle-filtered project context from explicit IDs",
      inputSchema: contextToolInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const result = await handler.handle(input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch {
        return sanitizedToolError();
      }
    },
  );
  return server;
}

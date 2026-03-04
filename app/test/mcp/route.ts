import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "ping",
      {
        title: "Ping",
        description: "Returns pong",
        inputSchema: z.object({
          message: z.string().default("ping"),
        }),
      },
      async ({ message }) => ({
        content: [{ type: "text", text: `pong: ${message}` }],
      })
    );
  },
  { serverInfo: { name: "mcp-test", version: "0.1.0" } },
  {
    basePath: "/test",
    maxDuration: 60,
    disableSse: true,
    sessionIdGenerator: undefined,
  }
);

export { handler as GET, handler as POST, handler as DELETE };

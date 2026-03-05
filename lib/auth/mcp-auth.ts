import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";

/**
 * Verify the MCP request's bearer token via Clerk OAuth.
 * Returns AuthInfo on success, or a 401 Response on failure.
 */
export async function verifyMcpAuth(
  req: Request
): Promise<AuthInfo | Response> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return unauthorizedResponse(req);
  }

  try {
    const clerkAuth = await auth({ acceptsToken: "oauth_token" });
    const result = await verifyClerkToken(clerkAuth, token);
    return result as AuthInfo;
  } catch {
    return unauthorizedResponse(req);
  }
}

function unauthorizedResponse(req: Request): Response {
  const url = new URL(req.url);
  const resourceMetadataUrl = `${url.origin}${RESOURCE_METADATA_PATH}`;

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    },
  });
}

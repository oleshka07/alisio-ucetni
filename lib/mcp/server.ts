import type { User } from "@prisma/client";
import { TOOLS, ToolError } from "./tools";
import { userForToken } from "./tokens";

/**
 * MCP server (Streamable HTTP, bez stavu): POST s JSON-RPC → odpověď JSON.
 * Autorizace: token v cestě /api/mcp/<token> (claude.ai „vlastní konektor“) nebo hlavička Authorization: Bearer <token>.
 */

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS =
  "Alisio Účetnictví: evidence plateb z bankovních výpisů a dokladů k nim (faktury, účtenky) pro více firem. " +
  "Typický postup dohledání dokladů: list_missing_documents → najdi fakturu v poště (import_email_attachments s dryRun, pak bez něj) " +
  "nebo nahraj soubor (upload_document s transactionId). Výpisy nahrávej přes upload_statement.";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handleOne(msg: Rpc, user: User) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notifikace (notifications/initialized …) — bez odpovědi
  switch (method) {
    case "initialize": {
      const asked = String(params?.protocolVersion || "");
      return ok(id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "alisio-ucetni", title: "Alisio Účetnictví", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, ...(t.annotations ? { annotations: t.annotations } : {}) })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return fail(id, -32602, `Neznámý nástroj: ${String(params?.name)}`);
      try {
        const result = await tool.run((params?.arguments as Record<string, unknown>) || {}, user);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 1) }] });
      } catch (e) {
        if (!(e instanceof ToolError)) console.error(`mcp ${tool.name}`, e);
        return ok(id, { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] });
      }
    }
    default:
      return fail(id, -32601, `Metoda není podporovaná: ${method}`);
  }
}

export function tokenFromRequest(req: Request, pathToken?: string): string | null {
  if (pathToken) return pathToken;
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

export async function handleMcp(req: Request, pathToken?: string): Promise<Response> {
  if (req.method === "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const auth = await userForToken(tokenFromRequest(req, pathToken));
  if (!auth) return Response.json(fail(null, -32001, "Neplatný nebo zrušený token"), { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(fail(null, -32700, "Parse error"), { status: 400 });
  }
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as Rpc[];
  const replies = (await Promise.all(msgs.map((m) => handleOne(m, auth.user)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(batch ? replies : replies[0]);
}

import { handleMcp } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** MCP konektor s tokenem v hlavičce Authorization: Bearer … (Claude Code, jiní klienti). */
export const POST = (req: Request) => handleMcp(req);
export const GET = (req: Request) => handleMcp(req);
export const DELETE = (req: Request) => handleMcp(req);

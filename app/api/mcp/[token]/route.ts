import { handleMcp } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ token: string }> };

/** MCP konektor s tokenem v adrese — claude.ai → Nastavení → Konektory → Vlastní konektor. */
export const POST = async (req: Request, { params }: Ctx) => handleMcp(req, (await params).token);
export const GET = async (req: Request, { params }: Ctx) => handleMcp(req, (await params).token);
export const DELETE = async (req: Request, { params }: Ctx) => handleMcp(req, (await params).token);

import { NextResponse } from "next/server";
import {
  getDevToolsStatus,
  installDevTool,
  installMissingDevTools,
  type DevToolId,
} from "@/lib/devToolsBootstrap";

const VALID_TOOLS = new Set<DevToolId>(["node", "git", "gh"]);

export async function GET() {
  try {
    const tools = await getDevToolsStatus();
    const missingRequired = tools.filter((t) => t.required && !t.installed);
    return NextResponse.json({
      tools,
      ready: missingRequired.length === 0,
      platform: process.platform,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to probe developer tools";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { action?: string; tool?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "install" && action !== "install-all" && action !== "refresh") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (action === "refresh") {
    const tools = await getDevToolsStatus();
    return NextResponse.json({
      tools,
      ready: tools.every((t) => !t.required || t.installed),
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };
      const log = (message: string) => send({ type: "log", message });

      try {
        if (action === "install-all") {
          log("Installing missing required tools…");
          const tools = await installMissingDevTools(log);
          send({
            type: "done",
            tools,
            ready: tools.every((t) => !t.required || t.installed),
          });
        } else {
          const tool = body.tool as DevToolId;
          if (!VALID_TOOLS.has(tool)) {
            send({ type: "error", message: "Unknown tool" });
            controller.close();
            return;
          }
          await installDevTool(tool, log);
          const tools = await getDevToolsStatus();
          send({
            type: "done",
            tools,
            ready: tools.every((t) => !t.required || t.installed),
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Install failed";
        send({ type: "error", message });
        try {
          const tools = await getDevToolsStatus();
          send({
            type: "done",
            tools,
            ready: tools.every((t) => !t.required || t.installed),
          });
        } catch {
          // ignore
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}

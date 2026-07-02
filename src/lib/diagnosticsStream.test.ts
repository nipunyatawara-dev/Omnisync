import { describe, it, expect } from "vitest";
import { readDiagnosticsNdjsonStream } from "@/lib/diagnosticsStream";

function ndjsonResponse(lines: string[]): Response {
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(new TextEncoder().encode(`${line}\n`));
      }
      controller.close();
    },
  });

  return new Response(body);
}

describe("readDiagnosticsNdjsonStream", () => {
  it("collects log lines and completes on success", async () => {
    const logs: string[] = [];
    await readDiagnosticsNdjsonStream(
      ndjsonResponse([
        JSON.stringify({ type: "log", message: "> npm cache clean" }),
        JSON.stringify({ type: "success" }),
      ]),
      (message) => logs.push(message)
    );

    expect(logs).toEqual(["> npm cache clean"]);
  });

  it("throws when the stream reports an error", async () => {
    await expect(
      readDiagnosticsNdjsonStream(
        ndjsonResponse([JSON.stringify({ type: "error", message: "Command failed with exit code 1" })]),
        () => {}
      )
    ).rejects.toThrow("Command failed with exit code 1");
  });
});

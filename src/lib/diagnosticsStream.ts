export async function readDiagnosticsNdjsonStream(
  response: Response,
  onLog: (message: string) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No output stream received");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line) as { type?: string; message?: string };
        if (data.type === "error") {
          throw new Error(data.message || "Command failed");
        }
        if (data.type === "log" && data.message) {
          onLog(data.message);
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }
}

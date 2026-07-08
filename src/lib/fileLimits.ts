export const MAX_READ_BYTES = 2 * 1024 * 1024;
export const MAX_WRITE_BYTES = 2 * 1024 * 1024;

export function exceedsWriteLimit(content: string): boolean {
  return Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES;
}

export function exceedsReadLimit(sizeBytes: number): boolean {
  return sizeBytes > MAX_READ_BYTES;
}

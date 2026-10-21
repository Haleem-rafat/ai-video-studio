import type { IncomingMessage } from "node:http";

/** A request's raw bytes (an uploaded file), refused past `limit` bytes. */
export async function rawBody(request: IncomingMessage, limit: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error(`The file is over ${Math.round(limit / 1024 / 1024)} MB`);
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

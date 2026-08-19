/**
 * Reading a `text/event-stream` response body.
 *
 * The framing here is fiddly in ways that are invisible until they bite, and it was already
 * written once for the suggestions stream. Sharing it means the next consumer inherits the
 * fixes rather than rediscovering them:
 *
 * - **Line endings are normalised.** A proxy that rewrites `\n` to `\r\n` would otherwise
 *   stop the `\n\n` frame separator ever matching, and not one event would be delivered.
 * - **The trailing frame is flushed on close.** A server that ends without a blank line
 *   would otherwise lose its last event — usually the `final` one, which is the answer.
 * - **The decoder is flushed too**, since a multi-byte character split across two chunks
 *   is held back until it completes.
 */

export interface SseFrame {
  event: string;
  data: string;
}

/** Parses one `event:`/`data:` frame. Returns null for comments and malformed frames. */
export function parseSseFrame(raw: string): SseFrame | null {
  let event = 'message';
  const data: string[] = [];

  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }

  return data.length > 0 ? { event, data: data.join('\n') } : null;
}

/**
 * Reads a response body to completion, invoking `onFrame` for each event.
 *
 * Throws whatever the underlying reader throws; the caller decides what an abort means.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consume = (final: boolean) => {
    buffer = buffer.replace(/\r\n?/g, '\n');
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const frame = parseSseFrame(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      if (frame) onFrame(frame);
    }
    if (final && buffer.trim()) {
      const frame = parseSseFrame(buffer);
      if (frame) onFrame(frame);
      buffer = '';
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    consume(false);
  }

  buffer += decoder.decode();
  consume(true);
}

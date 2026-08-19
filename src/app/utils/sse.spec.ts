import { parseSseFrame, readSseStream } from './sse';

/** A body that yields exactly the chunks given, so chunk boundaries can be chosen. */
function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i++]));
    },
  });
}

describe('parseSseFrame', () => {
  it('reads the event name and data', () => {
    expect(parseSseFrame('event: stage\ndata: {"step":1}')).toEqual({
      event: 'stage',
      data: '{"step":1}',
    });
  });

  it('defaults to the message event when none is named', () => {
    expect(parseSseFrame('data: hello')?.event).toBe('message');
  });

  it('joins multi-line data', () => {
    expect(parseSseFrame('event: x\ndata: one\ndata: two')?.data).toBe('one\ntwo');
  });

  it('ignores comment lines', () => {
    expect(parseSseFrame(': keep-alive\nevent: x\ndata: 1')?.data).toBe('1');
  });

  it('returns null for a frame carrying no data', () => {
    expect(parseSseFrame('event: x')).toBeNull();
    expect(parseSseFrame('')).toBeNull();
  });
});

describe('readSseStream', () => {
  it('delivers each frame in order', async () => {
    const seen: string[] = [];
    await readSseStream(bodyOf('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n'), (f) =>
      seen.push(`${f.event}=${f.data}`),
    );

    expect(seen).toEqual(['a=1', 'b=2']);
  });

  it('reassembles a frame split across chunks', async () => {
    const seen: string[] = [];
    await readSseStream(bodyOf('event: a\nda', 'ta: 1\n\n'), (f) => seen.push(f.data));

    expect(seen).toEqual(['1']);
  });

  it('normalises CRLF so the frame separator still matches', async () => {
    // A proxy that rewrites line endings would otherwise mean no event is ever delivered.
    const seen: string[] = [];
    await readSseStream(bodyOf('event: a\r\ndata: 1\r\n\r\n'), (f) => seen.push(f.data));

    expect(seen).toEqual(['1']);
  });

  it('flushes a trailing frame the server never terminated', async () => {
    // The dropped frame here is usually the final result — the answer itself.
    const seen: string[] = [];
    await readSseStream(bodyOf('event: final\ndata: done'), (f) => seen.push(f.data));

    expect(seen).toEqual(['done']);
  });

  it('handles a multi-byte character split across chunks', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('event: a\ndata: café\n\n');
    const cut = bytes.length - 4; // lands inside the é

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });

    const seen: string[] = [];
    await readSseStream(body, (f) => seen.push(f.data));

    expect(seen).toEqual(['café']);
  });
});

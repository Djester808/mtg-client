import { fitWithin, prepareAvatar } from './avatar-image';

describe('fitWithin', () => {
  it('scales the longest edge down to the cap and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it('leaves an image that already fits alone', () => {
    // Never upscales: a 64px avatar blown up to 1024 is a blurry 300KB upload.
    expect(fitWithin(64, 64, 1024)).toEqual({ width: 64, height: 64 });
  });

  it('keeps the short edge at one pixel rather than rounding it away', () => {
    // A panorama would otherwise scale to a height of 0, and a 0-height canvas cannot be
    // drawn to — the upload would fail with a DOM error instead of a picture.
    const fitted = fitWithin(10000, 3, 1024);

    expect(fitted.width).toBe(1024);
    expect(fitted.height).toBe(1);
  });

  it('tolerates a zero-sized source', () => {
    expect(fitWithin(0, 0, 1024)).toEqual({ width: 0, height: 0 });
  });
});

describe('prepareAvatar', () => {
  /** A real PNG, drawn here so the test exercises the decode path rather than a stub. */
  async function pngFile(width: number, height: number): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx!.fillStyle = '#3366cc';
    ctx!.fillRect(0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new File([blob!], 'photo.png', { type: 'image/png' });
  }

  it('shrinks an oversized photo to the dimension cap and encodes it as JPEG', async () => {
    const prepared = await prepareAvatar(await pngFile(1600, 1200), 256, 512 * 1024);

    expect(prepared.width).toBe(256);
    expect(prepared.height).toBe(192);
    expect(prepared.blob.type).toBe('image/jpeg');
    expect(prepared.blob.size).toBeLessThanOrEqual(512 * 1024);
  });

  it('rejects a file that is not an image', async () => {
    const notAnImage = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await expectAsync(prepareAvatar(notAnImage, 256, 512 * 1024)).toBeRejectedWithError(
      /Choose an image file/,
    );
  });

  it('rejects when no quality step can reach the byte cap', async () => {
    // One byte is unreachable at any quality, which is the shape of the real failure: a
    // huge noisy photograph that will not compress. Saying so beats uploading something
    // the server is about to refuse.
    await expectAsync(prepareAvatar(await pngFile(400, 400), 256, 1)).toBeRejectedWithError(
      /too detailed/,
    );
  });
});

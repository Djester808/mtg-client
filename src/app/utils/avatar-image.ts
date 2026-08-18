/**
 * Preparing a chosen photo for upload: downscale it, flatten it, and encode it small
 * enough that the server will take it.
 *
 * A phone camera roll image is 3–12 MB and 4000px on its longest edge; the avatar renders
 * at 96px. Uploading the original would spend a user's data allowance on pixels that are
 * thrown away, and the server refuses anything over its cap anyway — so the shrink happens
 * here, where the picture already is.
 *
 * None of this is a security control. The server re-sniffs the bytes it receives
 * (`AvatarImage.cs`) because anything sent from a browser can be sent by something else.
 */

/** Scales `width`×`height` down to fit inside a `max` square, never up. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest === 0) return { width, height };

  const scale = max / longest;
  // Round, then floor at 1: a very wide, very short image would otherwise scale its short
  // edge to 0 and produce a canvas that cannot be drawn to.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Quality ladder for the JPEG re-encode, tried in order until one fits the byte cap. */
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.55, 0.4];

export interface PreparedAvatar {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Loads an image file, scales it into `maxDimension`, and encodes it as JPEG under
 * `maxBytes`.
 *
 * Rejects with a message written for the user — the caller shows it as-is.
 */
export async function prepareAvatar(
  file: File,
  maxDimension: number,
  maxBytes: number,
): Promise<PreparedAvatar> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }

  const source = await loadImage(file);
  const size = fitWithin(source.width, source.height, maxDimension);

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not process the image.');

  // Flatten onto an opaque ground first. JPEG has no alpha, and a transparent PNG encoded
  // straight to JPEG gets black wherever it was see-through — which is most of a cut-out
  // avatar.
  ctx.fillStyle = '#14120e';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(source.image, 0, 0, size.width, size.height);

  source.release();

  for (const quality of QUALITY_STEPS) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= maxBytes) {
      return { blob, width: size.width, height: size.height };
    }
  }

  // Every quality step still too big means the source is pathological (a huge photograph
  // of noise). Saying so beats uploading something the server will only reject.
  throw new Error('That image is too detailed to shrink. Try a smaller crop.');
}

interface LoadedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function loadImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () =>
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };

    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

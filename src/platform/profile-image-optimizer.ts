/**
 * Nightjar profile portraits are resized and re-encoded in the user's browser.
 * Full-resolution originals are never transmitted to Firebase by this flow.
 *
 * Re-encoding also discards embedded camera metadata (including EXIF GPS).
 * The server still validates the submitted image's format and size.
 */
export const PROFILE_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const PROFILE_IMAGE_MAX_EDGE = 768;
export const PROFILE_IMAGE_TARGET_BYTES = 224 * 1024;
const PROFILE_IMAGE_MAX_PIXELS = 64_000_000;
const PROFILE_IMAGE_MIN_EDGE = 320;
const PROFILE_IMAGE_QUALITIES = [0.86, 0.76, 0.66, 0.56] as const;

export type OptimisedProfileImage = {
  file: File;
  originalBytes: number;
  outputBytes: number;
  width: number;
  height: number;
};

type ImageSource = {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

const acceptedTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'image/heic', 'image/heif', 'image/avif',
]);

const acceptedExtensions = /\.(jpe?g|png|webp|heic|heif|avif)$/i;

export function profileImageDimensions(width: number, height: number, maxEdge = PROFILE_IMAGE_MAX_EDGE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('This photo has invalid dimensions.');
  }
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export function formatProfileImageBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? Math.max(1, Math.round(bytes / 1024)) + ' KB'
    : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const loadProfileImage = async (file: File): Promise<ImageSource> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Older browsers may reject the ImageBitmap options even for decodable images.
      // Fall back to the browser's ordinary image decoder, including EXIF orientation.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The browser could not open this photo. Please use JPG or PNG.'));
      image.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
};

const toImageBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Your browser could not compress this photo. Please try a smaller JPG.'));
    }, type, quality);
  });

/**
 * Produce a small, metadata-free portrait without cropping the user's picture.
 * Tries WebP first; falls back to JPEG on browsers without canvas WebP encoding.
 * Never silently uploads the uncompressed original after an encoding failure.
 */
export async function optimiseProfileImage(file: File, purpose: 'portrait' | 'banner' = 'portrait'): Promise<OptimisedProfileImage> {
  const sourceType = file.type.toLowerCase();
  if (!acceptedTypes.has(sourceType) && !(sourceType === '' && acceptedExtensions.test(file.name))) {
    throw new Error('Choose a JPG, PNG, WebP or browser-supported HEIC/AVIF photo.');
  }
  if (!file.size || file.size > PROFILE_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error('Choose a photo smaller than 20 MB.');
  }

  const source = await loadProfileImage(file);
  try {
    if (!source.width || !source.height || source.width * source.height > PROFILE_IMAGE_MAX_PIXELS) {
      throw new Error('This photo is too large to process. Please use a smaller image.');
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot resize photos. Please try another browser.');

    let format: 'image/webp' | 'image/jpeg' = 'image/webp';

    for (const maxEdge of purpose === 'banner' ? [1600, 1440, 1280, 1024, 768] : [PROFILE_IMAGE_MAX_EDGE, 640, 512, 384, PROFILE_IMAGE_MIN_EDGE]) {
      const dimensions = profileImageDimensions(source.width, source.height, maxEdge);
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      const draw = () => {
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (format === 'image/jpeg') {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
      };

      draw();
      for (const quality of PROFILE_IMAGE_QUALITIES) {
        const blob = await toImageBlob(canvas, format, quality);
        if (blob.type !== format) {
          // HTMLCanvasElement may silently return PNG if the WebP encoder is absent.
          if (format !== 'image/webp') {
            throw new Error('Your browser cannot encode a supported photo format.');
          }
          format = 'image/jpeg';
          draw();
          const jpeg = await toImageBlob(canvas, format, quality);
          if (jpeg.type !== format) throw new Error('Your browser cannot encode a supported photo format.');
          if (jpeg.size <= (purpose === 'banner' ? 640 * 1024 : PROFILE_IMAGE_TARGET_BYTES)) {
            const safeName = file.name.replace(/\.[^.]+$/, '') || 'profile-photo';
            return { file: new File([jpeg], safeName + '.jpg', { type: format }), originalBytes: file.size, outputBytes: jpeg.size, ...dimensions };
          }
          continue;
        }

        if (blob.size <= (purpose === 'banner' ? 640 * 1024 : PROFILE_IMAGE_TARGET_BYTES)) {
          const safeName = file.name.replace(/\.[^.]+$/, '') || 'profile-photo';
          const extension = format === 'image/webp' ? '.webp' : '.jpg';
          return { file: new File([blob], safeName + extension, { type: format }), originalBytes: file.size, outputBytes: blob.size, ...dimensions };
        }
      }
    }

    throw new Error('This picture could not be reduced enough. Please choose a different photo.');
  } finally {
    source.release();
  }
}

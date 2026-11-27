/** Image helpers for the petty cash receipt uploader. */

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });
}

/**
 * Convert a picked file to a data URL.
 * Images are aggressively resized and compressed (default max dimension 1200px, quality 0.72)
 * so receipts and photos load quickly and don't overwhelm network bandwidth.
 * Transparent backgrounds are filled with white to prevent black backgrounds in JPEG.
 * PDFs, Excel files (.xlsx, .xls, .csv), and non-images pass through as raw data URLs.
 */
export async function fileToDownscaledDataUrl(
  file: File,
  maxDim = 1200,
  quality = 0.72
): Promise<string> {
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!isImage) {
    return readFileAsDataUrl(file);
  }

  const original = await readFileAsDataUrl(file);
  try {
    const image = await loadImage(original);
    const maxDimension = Math.max(image.width, image.height);
    const scale = maxDimension > maxDim ? maxDim / maxDimension : 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return original;

    // Fill white background for transparent PNG/canvas so JPEG doesn't get a black background
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch (err) {
    console.warn('Image downscaling failed, falling back to original:', err);
    return original;
  }
}

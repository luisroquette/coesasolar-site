/**
 * Compresses an image file using Canvas API.
 * Maintains readability for document OCR while reducing file size.
 * PDFs are returned as-is (no compression).
 */

const MAX_DIMENSION = 2048; // Max width or height — enough for OCR
const JPEG_QUALITY = 0.75; // Good balance between size and readability

export async function compressImageFile(file: File): Promise<File> {
  // Skip non-image files (PDFs, etc.)
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Only resize if larger than max dimension
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file); // fallback to original
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          // Only use compressed version if it's actually smaller
          if (blob.size >= file.size) {
            console.log(`[compressor] Skipped: compressed (${(blob.size / 1024).toFixed(0)}KB) >= original (${(file.size / 1024).toFixed(0)}KB)`);
            resolve(file);
            return;
          }

          const compressedFile = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          console.log(
            `[compressor] ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB (${Math.round((1 - compressedFile.size / file.size) * 100)}% reduction)`
          );

          resolve(compressedFile);
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar imagem para compressão'));
    };

    img.src = url;
  });
}

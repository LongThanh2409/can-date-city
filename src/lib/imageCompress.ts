/**
 * Photos are stored as base64 data URLs inside Firestore documents, whose hard limit is 1 MiB.
 * Keep the string well under that so the other fields always fit.
 */
export const MAX_DATA_URL_LENGTH = 900_000
export const MAX_IMAGE_SIDE = 2048
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45]
const MIN_IMAGE_SIDE = 640

export interface CompressedImage {
  dataUrl: string
  mimeType: string
  width: number
  height: number
}

/** Scales (width, height) down so the longer side is at most `maxSide`, keeping the aspect ratio. Never scales up. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) }
  const ratio = maxSide / longest
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

export function isImageFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name)
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Fall through to <img>, which some browsers decode more formats with (e.g. HEIC on Safari).
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('Trình duyệt không đọc được ảnh này. Hãy dùng ảnh JPG hoặc PNG.')
  }
}

export const THUMBNAIL_SIDE = 480

function encode(source: CanvasImageSource, width: number, height: number, maxSide: number, quality: number, canvas: HTMLCanvasElement): CompressedImage {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.')
  const size = fitWithin(width, height, maxSide)
  canvas.width = size.width
  canvas.height = size.height
  // JPEG has no transparency; paint white so transparent PNG areas don't turn black.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(source, 0, 0, size.width, size.height)
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg', width: size.width, height: size.height }
}

/** Re-encodes as JPEG, lowering quality and then size until it fits in a Firestore document. */
function encodeToFit(source: CanvasImageSource, width: number, height: number): CompressedImage {
  const canvas = document.createElement('canvas')
  for (let maxSide = MAX_IMAGE_SIDE; maxSide >= MIN_IMAGE_SIDE; maxSide = Math.round(maxSide * 0.8)) {
    for (const quality of QUALITY_STEPS) {
      const result = encode(source, width, height, maxSide, quality, canvas)
      if (result.dataUrl.length <= MAX_DATA_URL_LENGTH) return result
    }
  }
  throw new Error('Ảnh quá lớn, không thể nén đủ nhỏ để lưu.')
}

/** Full photo that fits in one Firestore document, plus a small thumbnail for the grid. Decodes the file once. */
export async function compressImageWithThumbnail(file: Blob): Promise<{ full: CompressedImage; thumbnail: CompressedImage }> {
  const decoded = await decode(file)
  try {
    return {
      full: encodeToFit(decoded.source, decoded.width, decoded.height),
      thumbnail: encode(decoded.source, decoded.width, decoded.height, THUMBNAIL_SIDE, 0.7, document.createElement('canvas')),
    }
  } finally {
    decoded.release()
  }
}

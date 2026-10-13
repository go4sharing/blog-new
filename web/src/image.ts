export const MAX_SOURCE_BYTES = 10 * 1024 * 1024 // 选择图片时的原图上限
export const MAX_WEBP_BYTES = 800 * 1024 // 与后端一致，转换后的上限
const MAX_WIDTH = 1600

export function checkImageFile(f: File): string | null {
  if (!f.type.startsWith('image/')) return '请选择图片文件'
  if (f.size > MAX_SOURCE_BYTES) return `图片不能超过 ${MAX_SOURCE_BYTES / 1024 / 1024}MB`
  return null
}

export const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)

/** 在浏览器里把图片转成 WebP；体积超限时先降质量，再逐步缩小尺寸 */
export async function toWebp(file: File): Promise<Blob> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new Error('无法读取该图片，请换一张（支持 PNG / JPG / WebP / GIF）')
  }

  try {
    let scale = Math.min(1, MAX_WIDTH / bmp.width)
    for (let round = 0; round < 6; round++) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bmp.width * scale))
      canvas.height = Math.max(1, Math.round(bmp.height * scale))
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)

      for (const q of [0.85, 0.75, 0.65, 0.55]) {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', q))
        // 不支持 WebP 编码的浏览器会静默回退成 PNG
        if (!blob || blob.type !== 'image/webp') throw new Error('当前浏览器不支持转换为 WebP，请换用 Chrome / Edge / Firefox / 新版 Safari')
        if (blob.size <= MAX_WEBP_BYTES) return blob
      }
      scale *= 0.8
    }
    throw new Error(`图片压缩后仍超过 ${MAX_WEBP_BYTES / 1024}KB，请换一张更小的图`)
  } finally {
    bmp.close()
  }
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })
}

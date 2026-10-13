// 把投稿的 WebP 图片写入 GitHub 仓库（Contents API），返回 jsDelivr CDN 地址。
// GITHUB_TOKEN 只存在于 Worker 密钥中，前端拿不到。
//
// 存放规则：{日期}/{机场名}.webp，同一天内重名则追加数字：{机场名}-1.webp、{机场名}-2.webp …

export interface GithubEnv {
  GITHUB_TOKEN?: string
  GITHUB_REPO?: string // owner/repo
  GITHUB_BRANCH?: string // 默认 main
  GITHUB_IMG_DIR?: string // 日期文件夹的上级目录，默认空（放在仓库根目录）
  IMG_BASE_URL?: string // 默认 jsDelivr：https://cdn.jsdelivr.net/gh/{repo}@{branch}
  GITHUB_API?: string // 默认 https://api.github.com，仅用于本地测试
}

export const MAX_IMG_BYTES = 800 * 1024
const MAX_NAME_TRIES = 50

export const githubConfigured = (env: GithubEnv) => !!env.GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO ?? '')

/** 校验并解码前端发来的 base64 WebP；非法返回 null */
export function decodeWebp(b64: unknown): { bytes: Uint8Array; b64: string } | null {
  if (typeof b64 !== 'string' || !b64 || b64.length > Math.ceil((MAX_IMG_BYTES * 4) / 3) + 8) return null
  const clean = b64.replace(/\s+/g, '')
  let bin: string
  try {
    bin = atob(clean)
  } catch {
    return null
  }
  if (bin.length < 32 || bin.length > MAX_IMG_BYTES) return null
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  // 文件头必须是 RIFF....WEBP，防止上传伪装成图片的其他文件
  const tag = (o: number, s: string) => [...s].every((ch, i) => bytes[o + i] === ch.charCodeAt(0))
  if (!tag(0, 'RIFF') || !tag(8, 'WEBP')) return null
  return { bytes, b64: clean }
}

/** 日期文件夹名，按北京时间（UTC+8）计算，避免凌晨落到前一天 */
export const dateFolder = (now = Date.now()) => new Date(now + 8 * 3600_000).toISOString().slice(0, 10)

/** 机场名 → 安全的文件名：保留中文与字母数字，路径分隔符、URL 特殊字符与空白统一替换为 - */
export function fileBase(name: string) {
  const s = name
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#%&+=\s\u0000-\u001f]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40)
    .replace(/[-.]+$/g, '')
  return s || 'airport'
}

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export async function uploadWebp(env: GithubEnv, airportName: string, img: { bytes: Uint8Array; b64: string }): Promise<string> {
  const repo = env.GITHUB_REPO!
  const branch = env.GITHUB_BRANCH || 'main'
  const root = (env.GITHUB_IMG_DIR || '').replace(/^\/+|\/+$/g, '')
  const folder = [root, dateFolder()].filter(Boolean).join('/')
  const base = fileBase(airportName)
  const api = (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '')

  // 不预先列目录，直接尝试写入；文件已存在时 GitHub 返回 422（缺少 sha），换下一个编号重试。
  // 这样即使两个人同时投同名机场，也不会互相覆盖。
  for (let n = 0; n < MAX_NAME_TRIES; n++) {
    const path = `${folder}/${n === 0 ? base : `${base}-${n}`}.webp`
    const res = await fetch(`${api}/repos/${repo}/contents/${enc(path)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'vpn-list-worker', // GitHub API 要求必须带 UA
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: `upload: ${path}`, content: img.b64, branch }),
    })

    if (res.ok) {
      const cdn = (env.IMG_BASE_URL || `https://cdn.jsdelivr.net/gh/${repo}@${branch}`).replace(/\/$/, '')
      return `${cdn}/${enc(path)}`
    }

    const body = (await res.json().catch(() => ({}))) as { message?: string }
    if (res.status === 422 && /sha/i.test(body.message ?? '')) continue // 重名，换编号
    console.error('github upload failed', res.status, body.message)
    throw new Error(`github ${res.status}`)
  }
  throw new Error('too many name collisions')
}

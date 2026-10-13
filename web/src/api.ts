import type { Airport, Comment, HitKind } from './types'

// 部署模式：
//   同域（默认）  Worker 同时托管前端与 API，/api 走相对路径
//   跨域          前端在 GitHub Pages，设置 VITE_API_BASE=https://xxx.workers.dev 指向 Worker
//   纯静态        设置 VITE_STATIC=1，只读 data/airports.json，评论 / 投稿 / 统计不可用
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')
export const HAS_API = import.meta.env.VITE_STATIC !== '1'

export const apiUrl = (path: string) => API_BASE + path
const DATA_URL = `${import.meta.env.BASE_URL}data/airports.json`

// 优先走 Worker API；失败时回退到静态 JSON，便于纯前端预览
export async function fetchAirports(): Promise<Airport[]> {
  if (HAS_API) {
    try {
      const r = await fetch(apiUrl('/api/airports'))
      if (r.ok) {
        const d = await r.json()
        if (Array.isArray(d) && d.length) return d
      }
    } catch {
      /* ignore */
    }
  }
  const r = await fetch(DATA_URL)
  return r.json()
}

export function track(id: string, kind: HitKind) {
  if (!HAS_API) return
  // 不用 sendBeacon：它固定携带凭据，跨域（前端在 GitHub Pages）时与 Access-Control-Allow-Origin: * 冲突，会被浏览器拦截。
  // keepalive 的 fetch 同样能在页面跳转时发出；text/plain 属于“简单请求”，不触发预检，后端按 JSON 解析正文，与 Content-Type 无关。
  try {
    fetch(apiUrl(`/api/airports/${encodeURIComponent(id)}/hit`), {
      method: 'POST',
      body: JSON.stringify({ kind }),
      headers: { 'Content-Type': 'text/plain' },
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}

export async function fetchComments(id: string): Promise<Comment[]> {
  if (!HAS_API) return []
  try {
    const r = await fetch(apiUrl(`/api/airports/${encodeURIComponent(id)}/comments`))
    return r.ok ? r.json() : []
  } catch {
    return []
  }
}

export interface ReactionState {
  emojis: string[]
  counts: Record<string, number>
  mine: string | null
}

export async function fetchReactions(id: string): Promise<ReactionState | null> {
  if (!HAS_API) return null
  try {
    const r = await fetch(apiUrl(`/api/airports/${encodeURIComponent(id)}/reactions`))
    return r.ok ? r.json() : null
  } catch {
    return null
  }
}

export async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  try {
    const r = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok && !data.error) {
      data.error = r.status >= 500 ? `服务暂时不可用（${r.status}），请确认后端已启动` : `请求失败（${r.status}）`
    }
    return { ok: r.ok, data } as { ok: boolean; data: any }
  } catch {
    return { ok: false, data: { error: '网络错误，无法连接服务器' } } as { ok: boolean; data: any }
  }
}

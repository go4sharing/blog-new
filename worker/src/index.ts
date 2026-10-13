import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { decodeWebp, githubConfigured, uploadWebp, type GithubEnv } from './github'
import { normalize } from './validate'

type Env = { DB: D1Database; ASSETS: Fetcher; ADMIN_TOKEN: string; TURNSTILE_SECRET: string; IP_SALT: string } & GithubEnv
type C = Context<{ Bindings: Env }>

const app = new Hono<{ Bindings: Env }>()
app.use('/api/*', cors())

const HIT_KINDS = ['view', 'website', 'channel', 'group', 'support']
const today = () => new Date().toISOString().slice(0, 10)
const nowIso = () => new Date().toISOString()

async function ipHash(c: C) {
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + c.env.IP_SALT))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifyTurnstile(c: C, token: unknown) {
  if (typeof token !== 'string' || !token) return false
  const form = new FormData()
  form.append('secret', c.env.TURNSTILE_SECRET)
  form.append('response', token)
  const ip = c.req.header('CF-Connecting-IP')
  if (ip) form.append('remoteip', ip)
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  const d = (await r.json()) as { success?: boolean }
  return !!d.success
}

/** 每日限频：返回 true 表示未超限 */
async function allow(c: C, key: string, limit: number) {
  const row = await c.env.DB.prepare(
    `INSERT INTO rate_limits(key,day,n) VALUES(?,?,1) ON CONFLICT(key,day) DO UPDATE SET n=n+1 RETURNING n`,
  ).bind(key, today()).first<{ n: number }>()
  return (row?.n ?? 1) <= limit
}

// ---- 管理接口防暴破 ----
const ADMIN_MAX_FAILS = 5 // 每个 IP 每小时最多失败次数，超限后锁定（即使之后给出正确 token 也拒绝）
const hourBucket = () => new Date().toISOString().slice(0, 13)

async function sha256(s: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}
/** 常量时间比较：先哈希成等长摘要，避免长度和逐字节耗时泄露 */
async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)])
  return crypto.subtle.timingSafeEqual(x, y)
}

const admin = async (c: C, next: () => Promise<void>) => {
  const key = `admin-fail:${await ipHash(c)}`
  const bucket = hourBucket()

  const row = await c.env.DB.prepare(`SELECT n FROM rate_limits WHERE key=? AND day=?`).bind(key, bucket).first<{ n: number }>()
  if ((row?.n ?? 0) >= ADMIN_MAX_FAILS) {
    return c.json({ error: '尝试次数过多，已临时锁定，请 1 小时后再试' }, 429, { 'Retry-After': '3600' })
  }

  const given = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const ok = !!c.env.ADMIN_TOKEN && !!given && (await safeEqual(given, c.env.ADMIN_TOKEN))
  if (!ok) {
    const r = await c.env.DB.prepare(
      `INSERT INTO rate_limits(key,day,n) VALUES(?,?,1) ON CONFLICT(key,day) DO UPDATE SET n=n+1 RETURNING n`,
    ).bind(key, bucket).first<{ n: number }>()
    // 顺手清理过期的限频记录，避免表无限增长
    if (Math.random() < 0.05) {
      await c.env.DB.prepare(`DELETE FROM rate_limits WHERE day < ?`).bind(new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10)).run()
    }
    const left = ADMIN_MAX_FAILS - (r?.n ?? 1)
    return c.json({ error: left > 0 ? `token 错误，还可尝试 ${left} 次` : '尝试次数过多，已临时锁定，请 1 小时后再试' }, left > 0 ? 401 : 429)
  }
  await next()
}

// ---------- 公开接口 ----------

app.get('/api/airports', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.data, a.updated_at,
            COALESCE(s.views,0) AS v, COALESCE(s.clicks,0) AS k,
            (SELECT ROUND(AVG(rating),1) FROM comments WHERE airport_id=a.id AND status='approved' AND rating>0) AS rating,
            (SELECT COUNT(*) FROM comments WHERE airport_id=a.id AND status='approved' AND rating>0) AS rc
     FROM airports a LEFT JOIN stats s ON s.airport_id=a.id
     WHERE a.status='published'`,
  ).all<{ data: string; updated_at: string; v: number; k: number; rating: number | null; rc: number }>()

  const list = results.map((r) => ({
    ...JSON.parse(r.data),
    hot: r.v + r.k * 3, // 浏览 + 点击加权
    rating: r.rating ?? undefined,
    ratingCount: r.rc,
    updatedAt: r.updated_at.slice(0, 10),
  }))
  return c.json(list, 200, { 'Cache-Control': 'public, max-age=60' })
})

app.post('/api/airports/:id/hit', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const kind = String(body.kind)
  if (!HIT_KINDS.includes(kind)) return c.json({ error: 'bad kind' }, 400)

  const exists = await c.env.DB.prepare(`SELECT 1 FROM airports WHERE id=? AND status='published'`).bind(id).first()
  if (!exists) return c.json({ error: 'not found' }, 404)

  const r = await c.env.DB.prepare(`INSERT OR IGNORE INTO events(airport_id,kind,ip_hash,day) VALUES(?,?,?,?)`)
    .bind(id, kind, await ipHash(c), today()).run()
  if (r.meta.changes > 0) {
    const [v, k] = kind === 'view' ? [1, 0] : [0, 1]
    await c.env.DB.prepare(
      `INSERT INTO stats(airport_id,views,clicks) VALUES(?,?,?)
       ON CONFLICT(airport_id) DO UPDATE SET views=views+excluded.views, clicks=clicks+excluded.clicks`,
    ).bind(id, v, k).run()
  }
  return c.json({ ok: true })
})

// ---- 表情回应 ----
const REACTIONS = ['👍', '❤️', '🔥', '😁', '😢', '👎']

async function reactionState(c: C, id: string) {
  const hash = await ipHash(c)
  const { results } = await c.env.DB.prepare(
    `SELECT emoji, COUNT(*) AS n, MAX(ip_hash=?) AS mine FROM reactions WHERE airport_id=? GROUP BY emoji`,
  ).bind(hash, id).all<{ emoji: string; n: number; mine: number }>()
  const counts: Record<string, number> = {}
  let mine: string | null = null
  for (const r of results) {
    counts[r.emoji] = r.n
    if (r.mine) mine = r.emoji
  }
  return { emojis: REACTIONS, counts, mine }
}

app.get('/api/airports/:id/reactions', async (c) => c.json(await reactionState(c, c.req.param('id'))))

app.post('/api/airports/:id/reactions', async (c) => {
  const id = c.req.param('id')
  const { emoji } = await c.req.json().catch(() => ({}))
  if (!REACTIONS.includes(emoji)) return c.json({ error: '不支持的表情' }, 400)
  const exists = await c.env.DB.prepare(`SELECT 1 FROM airports WHERE id=? AND status='published'`).bind(id).first()
  if (!exists) return c.json({ error: 'not found' }, 404)

  const hash = await ipHash(c)
  if (!(await allow(c, `react:${hash}`, 100))) return c.json({ error: '操作太频繁，请明天再试' }, 429)

  const cur = await c.env.DB.prepare(`SELECT emoji FROM reactions WHERE airport_id=? AND ip_hash=?`).bind(id, hash).first<{ emoji: string }>()
  if (cur?.emoji === emoji) {
    await c.env.DB.prepare(`DELETE FROM reactions WHERE airport_id=? AND ip_hash=?`).bind(id, hash).run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO reactions(airport_id,ip_hash,emoji,created_at) VALUES(?,?,?,?)
       ON CONFLICT(airport_id,ip_hash) DO UPDATE SET emoji=excluded.emoji, created_at=excluded.created_at`,
    ).bind(id, hash, emoji, nowIso()).run()
  }
  return c.json(await reactionState(c, id))
})

app.get('/api/airports/:id/comments', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id,nickname,content,rating,created_at FROM comments
     WHERE airport_id=? AND status='approved' ORDER BY id DESC LIMIT 50`,
  ).bind(c.req.param('id')).all()
  return c.json(results)
})

app.post('/api/airports/:id/comments', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => ({}))
  const nickname = String(b.nickname ?? '').trim().slice(0, 20)
  const content = String(b.content ?? '').trim()
  const rating = Math.min(5, Math.max(0, Number(b.rating) || 0))
  if (!nickname || content.length < 2 || content.length > 500) return c.json({ error: '昵称或内容不合法' }, 400)
  if (!(await verifyTurnstile(c, b.token))) return c.json({ error: '人机验证失败' }, 403)

  const hash = await ipHash(c)
  if (!(await allow(c, `comment:${hash}`, 5))) return c.json({ error: '今日评论次数已达上限' }, 429)
  const exists = await c.env.DB.prepare(`SELECT 1 FROM airports WHERE id=? AND status='published'`).bind(id).first()
  if (!exists) return c.json({ error: 'not found' }, 404)

  await c.env.DB.prepare(
    `INSERT INTO comments(airport_id,nickname,content,rating,status,ip_hash,created_at) VALUES(?,?,?,?, 'pending',?,?)`,
  ).bind(id, nickname, content, rating, hash, nowIso()).run()
  return c.json({ ok: true })
})

// 验证录入：公开提交，进入待审核
const IMAGE_SLOTS = [
  ['speedtest', 'speedtestImage'],
  ['topology', 'topologyImage'],
] as const

app.post('/api/submit', async (c) => {
  // 两张图片 base64 后不超过约 2.2MB，超出直接拒绝，避免被拿来灌流量
  if (Number(c.req.header('Content-Length') ?? 0) > 3 * 1024 * 1024) return c.json({ error: '提交内容过大' }, 413)
  const b = await c.req.json().catch(() => ({}))
  if (!(await verifyTurnstile(c, b.token))) return c.json({ error: '人机验证失败' }, 403)
  if (!(await allow(c, `submit:${await ipHash(c)}`, 3))) return c.json({ error: '今日提交次数已达上限' }, 429)

  // 公开投稿不接受外链图片，图片只能通过上传（经 WebP 校验后写入 GitHub）
  const raw = { ...(b.airport ?? {}) }
  delete raw.speedtestImage
  delete raw.topologyImage
  delete raw.speedtestAt

  const r = normalize(raw, false)
  if (!r.ok) return c.json({ error: r.error }, 400)
  const id = r.value.id as string
  if (await c.env.DB.prepare(`SELECT 1 FROM airports WHERE id=?`).bind(id).first()) return c.json({ error: '该标识已存在' }, 409)
  r.value.discoveredAt = today()

  // 先校验全部图片，再统一上传：任何一张不合法都不会产生 GitHub 提交
  const images = b.images && typeof b.images === 'object' ? b.images : {}
  const decoded: { label: string; field: string; img: NonNullable<ReturnType<typeof decodeWebp>> }[] = []
  for (const [label, field] of IMAGE_SLOTS) {
    if (images[label] == null) continue
    const img = decodeWebp(images[label])
    if (!img) return c.json({ error: `${label === 'speedtest' ? '测速图' : '拓扑图'}无效：需为 800KB 以内的 WebP 图片` }, 400)
    decoded.push({ label, field, img })
  }
  if (decoded.length) {
    if (!githubConfigured(c.env)) return c.json({ error: '图片上传暂未开通，请先不带图片投稿' }, 503)
    try {
      // 串行上传：并发写同一分支会触发 409 冲突
      for (const d of decoded) r.value[d.field] = await uploadWebp(c.env, String(r.value.name), d.img)
    } catch {
      return c.json({ error: '图片上传失败，请稍后再试' }, 502)
    }
  }

  const now = nowIso()
  await c.env.DB.prepare(
    `INSERT INTO airports(id,data,status,source,created_at,updated_at) VALUES(?,?, 'pending','submit',?,?)`,
  ).bind(id, JSON.stringify(r.value), now, now).run()
  return c.json({ ok: true })
})

// ---------- 管理接口 ----------

const adm = new Hono<{ Bindings: Env }>()
adm.use('*', admin)

// 快速录入 / 爬虫入库：对象或数组，按 id 覆盖
adm.post('/airports', async (c) => {
  const body = await c.req.json().catch(() => null)
  const items = Array.isArray(body) ? body : [body]
  const now = nowIso()
  const stmts: D1PreparedStatement[] = []
  const errors: string[] = []

  for (const it of items) {
    const r = normalize(it, true)
    if (!r.ok) { errors.push(r.error); continue }
    // 发现时间：显式传入 > 已有记录保留 > 今天
    if (!r.value.discoveredAt) {
      const old = await c.env.DB.prepare(`SELECT data FROM airports WHERE id=?`).bind(r.value.id).first<{ data: string }>()
      r.value.discoveredAt = (old && JSON.parse(old.data).discoveredAt) || today()
    }
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO airports(id,data,status,source,created_at,updated_at) VALUES(?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET data=excluded.data, status=excluded.status, source=excluded.source, updated_at=excluded.updated_at`,
      ).bind(r.value.id, JSON.stringify(r.value), it?.status === 'pending' ? 'pending' : 'published', r.value.source, now, now),
    )
  }
  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ saved: stmts.length, errors }, errors.length && !stmts.length ? 400 : 200)
})

adm.get('/pending', async (c) => {
  const a = await c.env.DB.prepare(`SELECT data, created_at FROM airports WHERE status='pending' ORDER BY created_at DESC LIMIT 100`).all<{ data: string; created_at: string }>()
  // 评论带上所属机场名称，审核时不用再对照 id
  const m = await c.env.DB.prepare(
    `SELECT c.id, c.airport_id, c.nickname, c.content, c.rating, c.created_at,
            json_extract(a.data, '$.name') AS airport_name
     FROM comments c LEFT JOIN airports a ON a.id = c.airport_id
     WHERE c.status='pending' ORDER BY c.id DESC LIMIT 100`,
  ).all()
  return c.json({
    airports: a.results.map((r) => ({ ...JSON.parse(r.data), submittedAt: r.created_at })),
    comments: m.results,
  })
})

// 审核时修改投稿信息：按管理员口径重新校验；保留来源与发现时间，默认保持待审核，publish=true 时同时通过
adm.put('/airports/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  if (!b || typeof b.airport !== 'object') return c.json({ error: '数据格式错误' }, 400)

  const old = await c.env.DB.prepare(`SELECT data, status, source, created_at FROM airports WHERE id=?`)
    .bind(id).first<{ data: string; status: string; source: string; created_at: string }>()
  if (!old) return c.json({ error: 'not found' }, 404)

  const r = normalize({ ...b.airport, id }, true)
  if (!r.ok) return c.json({ error: r.error }, 400)

  const prev = JSON.parse(old.data)
  r.value.source = prev.source ?? old.source
  if (prev.discoveredAt) r.value.discoveredAt = prev.discoveredAt
  const status = b.publish === true ? 'published' : old.status

  await c.env.DB.prepare(`UPDATE airports SET data=?, status=?, updated_at=? WHERE id=?`)
    .bind(JSON.stringify(r.value), status, nowIso(), id).run()
  return c.json({ ok: true, status, airport: { ...r.value, submittedAt: old.created_at } })
})

adm.post('/airports/:id/status', async (c) => {
  const { status } = await c.req.json().catch(() => ({}))
  if (!['published', 'pending'].includes(status)) return c.json({ error: 'bad status' }, 400)
  await c.env.DB.prepare(`UPDATE airports SET status=?, updated_at=? WHERE id=?`).bind(status, nowIso(), c.req.param('id')).run()
  return c.json({ ok: true })
})

adm.delete('/airports/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM airports WHERE id=?`).bind(id),
    c.env.DB.prepare(`DELETE FROM stats WHERE airport_id=?`).bind(id),
    c.env.DB.prepare(`DELETE FROM reactions WHERE airport_id=?`).bind(id),
  ])
  return c.json({ ok: true })
})

adm.post('/comments/:id/status', async (c) => {
  const { status } = await c.req.json().catch(() => ({}))
  if (!['approved', 'rejected'].includes(status)) return c.json({ error: 'bad status' }, 400)
  await c.env.DB.prepare(`UPDATE comments SET status=? WHERE id=?`).bind(status, c.req.param('id')).run()
  return c.json({ ok: true })
})

app.route('/api/admin', adm)

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404))

// 其余请求交给静态资源（前端页面，带 SPA 回退）
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app

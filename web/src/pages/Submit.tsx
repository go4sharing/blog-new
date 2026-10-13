import { useState, type FormEvent, type ReactNode } from 'react'
import { HAS_API, postJson } from '../api'
import ImagePicker from '../components/ImagePicker'
import { Turnstile } from '../components/ui'
import { blobToBase64, toWebp } from '../image'
import { PERIOD_LABEL, TAGS, TAG_KEYS } from '../lib'
import type { Period, Tag } from '../types'

const PERIODS = Object.keys(PERIOD_LABEL) as Period[]

const input = 'w-full rounded border border-line bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent'

interface PlanRow {
  price: string
  period: Period
  traffic: string
  nodes: string
}
const emptyPlan = (): PlanRow => ({ price: '', period: 'month', traffic: '', nodes: '' })

// 标识用于 URL：英文名取 slug，其余用 u 前缀，统一追加随机后缀避免冲突
function makeId(name: string) {
  const slug = /^[A-Za-z0-9 .\-_]+$/.test(name) ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) : ''
  return `${slug || 'u'}-${Math.random().toString(36).slice(2, 7)}`
}

// group：内容是一组按钮 / 复选框时用 div，避免 label 把点击转发给第一个控件
function Field({ label, hint, required, group, children }: { label: string; hint?: string; required?: boolean; group?: boolean; children: ReactNode }) {
  const Wrap = group ? 'div' : 'label'
  return (
    <Wrap className="block space-y-1">
      <span className="block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </Wrap>
  )
}

export default function Submit() {
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [foundedAt, setFoundedAt] = useState('')
  const [plans, setPlans] = useState<PlanRow[]>([emptyPlan()])
  const [freeCode, setFreeCode] = useState('')
  const [notes, setNotes] = useState('')
  const [support, setSupport] = useState('')
  const [group, setGroup] = useState('')
  const [channel, setChannel] = useState('')
  const [speedFile, setSpeedFile] = useState<File | null>(null)
  const [topoFile, setTopoFile] = useState<File | null>(null)
  const [desc, setDesc] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState('')

  const setPlan = (i: number, patch: Partial<PlanRow>) => setPlans(plans.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (!token) return setMsg({ ok: false, text: '请先完成人机验证' })

    // 1) 浏览器内转 WebP；转换失败时验证码尚未使用，无需重新验证
    const images: Record<string, string> = {}
    try {
      setBusy('正在转换图片为 WebP…')
      if (speedFile) images.speedtest = await blobToBase64(await toWebp(speedFile))
      if (topoFile) images.topology = await blobToBase64(await toWebp(topoFile))
    } catch (err) {
      setBusy('')
      return setMsg({ ok: false, text: err instanceof Error ? err.message : '图片处理失败' })
    }

    // 2) 连同表单一起交给后端，由后端写入 GitHub
    setBusy(Object.keys(images).length ? '正在上传图片并提交…' : '正在提交…')
    const r = await postJson('/api/submit', {
      token,
      images,
      airport: {
        id: makeId(name.trim()),
        name: name.trim(),
        desc: desc.trim(),
        tags,
        website: website.trim(),
        foundedAt: foundedAt || undefined,
        freeCode: freeCode.trim() || undefined,
        notes: notes.split('\n').map((s) => s.trim()).filter(Boolean),
        plans: plans.map((p, i) => ({
          name: p.price === '' || Number(p.price) === 0 ? '免费套餐' : plans.length > 1 ? `套餐${i + 1}` : '基础套餐',
          price: Number(p.price) || 0,
          period: p.period,
          traffic: p.traffic.trim(),
          nodes: p.nodes.trim() || undefined,
        })),
        contacts: {
          ...(support.trim() && { support: support.trim() }),
          ...(group.trim() && { group: group.trim() }),
          ...(channel.trim() && { channel: channel.trim() }),
        },
        status: 'ok',
      },
    })
    setBusy('')
    // 验证码令牌只能用一次，无论成败都要重置
    setToken('')
    window.turnstile?.reset()
    if (r.ok) {
      setMsg({ ok: true, text: '提交成功，审核通过后展示，感谢投稿！' })
      setSpeedFile(null)
      setTopoFile(null)
    } else {
      setMsg({ ok: false, text: r.data.error || '提交失败，请稍后再试' })
    }
  }

  if (!HAS_API) return <p className="py-10 text-center text-sm text-muted">当前为纯静态部署，暂不支持在线投稿。</p>

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">投稿收录</h1>
        <p className="text-sm text-muted">填写机场信息，提交后需人工审核。每个 IP 每天最多提交 3 次，推广链接由站长维护，请勿填写邀请码。</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="机场名称" required>
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="如：MiCat" className={input} />
        </Field>
        <Field label="机场创建时间" hint="选填，大致的开业年月即可">
          <input type="month" max={new Date().toISOString().slice(0, 7)} value={foundedAt} onChange={(e) => setFoundedAt(e.target.value)} className={input} />
        </Field>
      </div>

      <Field label="注册地址" required hint="机场的注册页，不要带邀请码">
        <input required type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={input} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          套餐<span className="ml-0.5 text-red-500">*</span>
          <span className="ml-2 text-xs font-normal text-muted">价格填 0 表示免费；节点数可带 +，如 20 或 40+</span>
        </legend>
        {plans.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <input required type="number" min={0} step="0.01" value={p.price} onChange={(e) => setPlan(i, { price: e.target.value })} placeholder="价格（元）" className={`${input} w-28! shrink-0`} />
            <select value={p.period} onChange={(e) => setPlan(i, { period: e.target.value as Period })} className="shrink-0 rounded border border-line bg-bg px-2 py-1.5 text-sm">
              {PERIODS.map((k) => (
                <option key={k} value={k}>/{PERIOD_LABEL[k]}</option>
              ))}
            </select>
            <input required maxLength={30} value={p.traffic} onChange={(e) => setPlan(i, { traffic: e.target.value })} placeholder="流量，如 100G/月" className={`${input} min-w-32 flex-1`} />
            <input pattern="\d{1,4}\+?" value={p.nodes} onChange={(e) => setPlan(i, { nodes: e.target.value })} placeholder="节点数" aria-label="节点数" className={`${input} w-24! shrink-0`} />
            {plans.length > 1 && (
              <button type="button" onClick={() => setPlans(plans.filter((_, j) => j !== i))} className="px-1 text-muted hover:text-red-500" aria-label="删除套餐">
                ✕
              </button>
            )}
          </div>
        ))}
        {plans.length < 5 && (
          <button type="button" onClick={() => setPlans([...plans, emptyPlan()])} className="text-sm text-accent">
            + 添加套餐
          </button>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="白嫖码" hint="免费或试用机场的注册码，没有可留空">
          <input maxLength={30} value={freeCode} onChange={(e) => setFreeCode(e.target.value)} className={input} />
        </Field>
        <Field label="备注" hint="每行一条，最多 5 条">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={'进群获取白嫖码\n需要订阅找客服获取'} className={input} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">联系方式<span className="ml-2 text-xs font-normal text-muted">至少填写一项更利于通过审核</span></legend>
        <input value={support} onChange={(e) => setSupport(e.target.value)} placeholder="官方客服  https://t.me/xxx" className={input} />
        <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="官方群  https://t.me/xxx" className={input} />
        <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="官方频道  https://t.me/xxx" className={input} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <ImagePicker label="测速图" hint="建议带上测试时间的截图" file={speedFile} onChange={setSpeedFile} />
        <ImagePicker label="拓扑图" hint="选填" file={topoFile} onChange={setTopoFile} />
      </div>

      <Field label="简介" hint="选填，200 字以内">
        <textarea maxLength={200} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className={input} />
      </Field>

      <Field label="标签" hint="按下面的说明选择，没有符合的就不选，审核时会校对" group>
        <div className="grid gap-2 sm:grid-cols-2">
          {TAG_KEYS.map((t) => (
            <label key={t} className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2 text-sm hover:bg-hover">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={tags.includes(t)}
                onChange={(e) => setTags(e.target.checked ? [...tags, t] : tags.filter((x) => x !== t))}
              />
              <span>
                <span className="font-medium">{TAGS[t].label}</span>
                {TAGS[t].desc && <span className="block text-xs text-muted">{TAGS[t].desc}</span>}
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Turnstile onToken={setToken} />

      <div className="flex items-center gap-3">
        <button disabled={!!busy} className="rounded bg-accent px-5 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {busy || '提交投稿'}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{msg.text}</span>}
      </div>
    </form>
  )
}

import { useEffect, useRef, useState } from 'react'
import { track } from '../api'
import { STATUS, TAGS } from '../lib'
import type { Airport, Status, Tag } from '../types'

export function TagBadge({ tag }: { tag: Tag }) {
  const t = TAGS[tag]
  return (
    <span title={t.desc} className={`inline-block rounded px-1.5 py-0.5 text-xs ${t.cls}`}>
      {t.label}
    </span>
  )
}

export function StatusDot({ status }: { status: Status }) {
  const s = STATUS[status]
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

export function Avatar({ a, size = 32 }: { a: Airport; size?: number }) {
  if (a.logo) return <img src={a.logo} alt="" width={size} height={size} className="rounded-md object-cover" style={{ width: size, height: size }} />
  return (
    <span
      className="inline-flex items-center justify-center rounded-md bg-hover font-medium text-muted"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {a.name.slice(0, 1)}
    </span>
  )
}

export function SpeedImage({ a, className = '' }: { a: Airport; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-md border border-line bg-hover ${className}`}>
      {a.speedtestImage ? (
        <img src={a.speedtestImage} alt={`${a.name} 测速图`} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
      ) : (
        <div className="flex h-full min-h-20 items-center justify-center text-xs text-muted">暂无测速图</div>
      )}
    </div>
  )
}

/** 详情页大图：完整展示，点击进入全屏预览 */
export function ImageBlock({ src, alt, onOpen }: { src: string; alt: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="点击全屏预览"
      className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-line bg-hover"
    >
      <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className="mx-auto max-h-[640px] w-auto max-w-full object-contain" />
      <span className="absolute right-2 top-2 rounded bg-black/55 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
        全屏预览
      </span>
    </button>
  )
}

export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      /* ignore */
    }
  }
  return (
    <button type="button" onClick={copy} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:bg-hover hover:text-fg">
      {done ? '已复制' : label}
    </button>
  )
}

const REL = 'nofollow sponsored noopener noreferrer'

export function TelegramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        fill="#fff"
        d="M5.4 11.7 17.9 6.9C18.5 6.7 19 7.1 18.8 7.9L16.7 17.6C16.5 18.3 16.1 18.5 15.5 18.2L12.3 15.8 10.8 17.3C10.6 17.5 10.5 17.6 10.2 17.6L10.4 14.3 16.4 8.9C16.7 8.6 16.3 8.5 16 8.7L8.6 13.3 5.4 12.3C4.7 12.1 4.7 11.9 5.4 11.7Z"
      />
    </svg>
  )
}

// t.me/xxx → @xxx；t.me/+xxxx（邀请链接）不展示具体内容
function tgHandle(url: string) {
  try {
    const u = new URL(url)
    if (!/^(t|telegram)\.me$/.test(u.hostname)) return null
    const seg = u.pathname.split('/').filter(Boolean)[0]
    if (!seg) return null
    return seg.startsWith('+') || seg === 'joinchat' ? '邀请链接' : `@${seg}`
  } catch {
    return null
  }
}

export function ContactLinks({ a, detail = false }: { a: Airport; detail?: boolean }) {
  const items = [
    ['channel', '频道', a.contacts.channel],
    ['group', '群组', a.contacts.group],
    ['support', '客服', a.contacts.support],
  ] as const
  return (
    <div className={detail ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-1.5'}>
      {items.map(([k, label, url]) => {
        if (!url) return null
        const handle = tgHandle(url)
        return (
          <a
            key={k}
            href={url}
            target="_blank"
            rel={REL}
            onClick={() => track(a.id, k)}
            title={handle ? `在 Telegram 打开${label}` : undefined}
            className={
              detail
                ? 'inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-hover'
                : 'inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 text-xs text-muted hover:bg-hover hover:text-fg'
            }
          >
            {handle && <TelegramIcon size={detail ? 18 : 12} />}
            <span className={detail ? 'font-medium' : ''}>{label}</span>
            {detail && handle && <span className="text-xs text-muted">{handle}</span>}
          </a>
        )
      })}
    </div>
  )
}

export function WebsiteButton({ a, className = '' }: { a: Airport; className?: string }) {
  return (
    <a
      href={a.aff || a.website}
      target="_blank"
      rel={REL}
      onClick={() => track(a.id, 'website')}
      className={`rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 ${className}`}
    >
      官网
    </a>
  )
}

declare global {
  interface Window {
    turnstile?: any
  }
}

export function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sitekey = import.meta.env.VITE_TURNSTILE_SITEKEY || '1x00000000000000000000AA' // 官方测试 key
    let id: string | undefined
    let dead = false
    const render = () => {
      if (dead || !ref.current || !window.turnstile) return
      id = window.turnstile.render(ref.current, {
        sitekey,
        theme: 'auto',
        callback: onToken,
        'expired-callback': () => onToken(''),
      })
    }
    if (window.turnstile) render()
    else {
      let s = document.getElementById('cf-turnstile') as HTMLScriptElement | null
      if (!s) {
        s = document.createElement('script')
        s.id = 'cf-turnstile'
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        s.async = true
        document.head.appendChild(s)
      }
      s.addEventListener('load', render)
    }
    return () => {
      dead = true
      if (id && window.turnstile) window.turnstile.remove(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div ref={ref} />
}

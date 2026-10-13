import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { HAS_API } from '../api'
import { useTheme } from '../theme'

const ICON = { light: '☀', dark: '☾', system: '◐' } as const
const LABEL = { light: '浅色', dark: '深色', system: '跟随系统' } as const

export function Layout() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const { mode, cycle } = useTheme()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    nav(`/search?q=${encodeURIComponent(q.trim())}`)
  }
  const link = ({ isActive }: { isActive: boolean }) => `rounded px-2 py-1 text-sm hover:bg-hover ${isActive ? 'font-medium' : 'text-muted'}`

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link to="/" className="mr-1 text-sm font-semibold">机场导航</Link>
          <nav className="flex gap-1">
            <NavLink to="/" end className={link}>首页</NavLink>
            <NavLink to="/category" className={link}>分类</NavLink>
            {HAS_API && <NavLink to="/submit" className={link}>投稿</NavLink>}
          </nav>
          <form onSubmit={submit} className="ml-auto flex-1 sm:max-w-xs">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索名称 / 标签 / 协议"
              className="w-full rounded border border-line bg-transparent px-2.5 py-1 text-sm outline-none focus:border-accent"
            />
          </form>
          <button onClick={cycle} title={`主题：${LABEL[mode]}`} className="rounded px-2 py-1 text-sm text-muted hover:bg-hover">
            {ICON[mode]}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        <p>本站仅收录与展示公开信息，不提供任何服务，不对第三方服务质量负责。请遵守所在地法律法规，注意资金安全，谨防跑路。</p>
        {HAS_API && (
          <p className="mt-1">
            <Link to="/submit" className="hover:text-fg">提交收录</Link>
          </p>
        )}
      </footer>
    </div>
  )
}

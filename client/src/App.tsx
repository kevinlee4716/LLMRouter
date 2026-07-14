import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Moon, Sun, Route as RouteIcon, Key, Play, Shield, Cable, Settings } from 'lucide-react'
import { AuthGate } from '@/components/auth-gate'
import { ErrorBoundary } from '@/components/error-boundary'
import { Toaster } from '@/components/toaster'
import { I18nProvider } from '@/i18n'
import { logout } from '@/lib/api'
import { toast } from '@/lib/toast'
import KeysPage from '@/pages/KeysPage'
import PlaygroundPage from '@/pages/PlaygroundPage'
import FallbackPage from '@/pages/FallbackPage'
import ModelDetailPage from '@/pages/ModelDetailPage'
import FusionPage from '@/pages/FusionPage'
import EmbeddingsPage from '@/pages/EmbeddingsPage'
import ImagePage from '@/pages/ImagePage'
import AudioPage from '@/pages/AudioPage'
import MediaDetailPage from '@/pages/MediaDetailPage'
import EmbeddingDetailPage from '@/pages/EmbeddingDetailPage'
import GuardrailsPage from '@/pages/GuardrailsPage'
import SettingsPage from '@/pages/SettingsPage'
import OutboundApiPage from '@/pages/OutboundApiPage'
import NotFoundPage from '@/pages/NotFoundPage'

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silenceToast) return
      toast.error(error instanceof Error ? error.message : String(error))
    },
  }),
})

const navItems = [
  { to: '/models', label: '网关路由', icon: RouteIcon },
  { to: '/keys', label: '模型密匙', icon: Key },
  { to: '/playground', label: '模型测试', icon: Play },
  { to: '/guardrails', label: '安全防护', icon: Shield },
  { to: '/outbound', label: '路由出站API', icon: Cable },
  { to: '/settings', label: '设置', icon: Settings },
]

function getPreferredDarkMode() {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('theme') !== 'light'
}

const SIDEBAR_W = 208

// ── Sidebar ────────────────────────────────────────────────────────────────
function Sidebar() {
  const { dark, toggle } = useDarkMode()
  const location = useLocation()

  function isActive(to: string) {
    if (to === '/models') return location.pathname.startsWith('/models')
    return location.pathname === to
  }

  return (
    <aside
      className="sticky top-0 h-screen shrink-0 flex flex-col border-r border-border/40 bg-card/40 backdrop-blur-xl select-none z-40"
      style={{ width: SIDEBAR_W }}
    >
      {/* Logo */}
      <Link
        to="/"
        className="flex items-center h-16 px-5 gap-3 border-b border-border/30 shrink-0"
      >
        <svg width="36" height="36" viewBox="0 0 64 64" className="shrink-0 logo-glow">
          <defs>
            <linearGradient id="sb-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00e5ff"/>
              <stop offset="100%" stopColor="#a855f7"/>
            </linearGradient>
            <linearGradient id="sb-bolt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00e5ff"/>
              <stop offset="100%" stopColor="#a855f7"/>
            </linearGradient>
          </defs>
          <polygon points="32,8 52,20 52,44 32,56 12,44 12,20" fill="none" stroke="url(#sb-ring)" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M20 28 L28 22 L28 32 L36 26 L36 36 L44 30" fill="none" stroke="url(#sb-bolt)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="20" cy="28" r="2.5" fill="#00e5ff"/>
          <circle cx="44" cy="30" r="2.5" fill="#a855f7"/>
        </svg>
        <span className="font-semibold text-[15px] brand-gradient-text whitespace-nowrap tracking-tight">
          LLMRouter
        </span>
      </Link>

      {/* Navigation — icon + text */}
      <nav className="flex-1 py-3 space-y-0.5">
        {navItems.map(item => {
          const Icon = item.icon
          const active = isActive(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`nav-active-indicator ${active ? 'is-active' : ''} flex items-center mx-2 h-10 px-3.5 gap-3 rounded-xl transition-all duration-200 ease-out ${
                active
                  ? 'bg-primary/12 text-primary font-semibold shadow-sm shadow-primary/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'
              }`}
            >
              <Icon className={`size-[18px] shrink-0 ${active ? 'text-primary' : ''}`} />
              <span className="text-[13px] whitespace-nowrap">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom: theme + logout */}
      <div className="border-t border-border/30 py-2 px-2 space-y-0.5 shrink-0">
        <button
          onClick={toggle}
          className="flex items-center w-full h-8 px-2 gap-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-all duration-200"
        >
          {dark ? <Sun className="size-[18px] shrink-0" /> : <Moon className="size-[18px] shrink-0" />}
          <span className="text-[12px] whitespace-nowrap">{dark ? '浅色模式' : '深色模式'}</span>
        </button>

        <button
          onClick={() => { logout(); toast.info('已退出登录') }}
          className="flex items-center w-full h-8 px-2 gap-3 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/5 transition-all duration-200"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="text-[12px] whitespace-nowrap">退出登录</span>
        </button>
      </div>
    </aside>
  )
}

function useDarkMode() {
  const [dark, setDark] = useState(getPreferredDarkMode)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  return { dark, toggle: () => setDark(d => { const n = !d; localStorage.setItem('theme', n ? 'dark' : 'light'); return n }) }
}

function PageBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthGate>
          <div className="min-h-screen bg-background flex">
            <Sidebar />
            <main className="flex-1 min-w-0 px-6 py-8">
              <PageBoundary>
              <div className="page-transition">
              <Routes>
                <Route path="/" element={<Navigate to="/models/chat" replace />} />
                <Route path="/models" element={<Navigate to="/models/chat" replace />} />
                <Route path="/models/chat" element={<FallbackPage />} />
                <Route path="/models/chat/:id" element={<ModelDetailPage />} />
                <Route path="/models/fusion" element={<FusionPage />} />
                <Route path="/models/embeddings" element={<EmbeddingsPage />} />
                <Route path="/models/embeddings/:id" element={<EmbeddingDetailPage />} />
                <Route path="/models/image" element={<ImagePage />} />
                <Route path="/models/image/:id" element={<MediaDetailPage modality="image" />} />
                <Route path="/models/audio" element={<AudioPage />} />
                <Route path="/models/audio/:id" element={<MediaDetailPage modality="audio" />} />
                <Route path="/playground" element={<PlaygroundPage />} />
                <Route path="/keys" element={<KeysPage />} />
                <Route path="/guardrails" element={<GuardrailsPage />} />
                <Route path="/outbound" element={<OutboundApiPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/test" element={<Navigate to="/playground" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              </div>
              </PageBoundary>
            </main>
            <Toaster />
          </div>
        </AuthGate>
      </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  )
}

export default App

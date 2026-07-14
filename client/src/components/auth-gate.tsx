import { useEffect, useState, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, setToken, UNAUTHORIZED_EVENT, type ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/i18n'

const PASSWORD_MIN = 8

interface AuthStatus {
  needsSetup: boolean
  authenticated: boolean
  username: string | null
  email: string | null
}

// ── Matrix Rain Effect ───────────────────────────────────────────────────
function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const chars = '日月山水火木人大天口耳目手足牛羊马鱼鸟龙风云雨雷电田井门户车舟刀弓矢示王中卜甲骨一二三四五六七八九〇☰☱☲☳☴☵☶☷⚊⚋⊗⊕⊖⊙⊛0110'
    const fontSize = 14
    const columns = canvas.width / fontSize
    const drops: number[] = Array(Math.floor(columns)).fill(1)
    let animId: number

    function draw() {
      if (!canvas) return
      ctx!.fillStyle = 'rgba(0, 0, 30, 0.05)'
      ctx!.fillRect(0, 0, canvas.width, canvas.height)
      ctx!.fillStyle = '#0f0'
      ctx!.font = `${fontSize}px monospace`
      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize
        // Vary brightness for depth
        const brightness = 0.3 + Math.random() * 0.7
        ctx!.fillStyle = `rgba(0,${Math.floor(180 + brightness * 75)},${Math.floor(50 + brightness * 30)},${brightness})`
        ctx!.fillText(text, x, y)
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0
        drops[i]++
      }
      animId = requestAnimationFrame(draw)
    }
    animId = requestAnimationFrame(draw)
    const handleResize = () => { if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight } }
    window.addEventListener('resize', handleResize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', handleResize) }
  }, [])
  return <canvas ref={canvasRef} className="absolute inset-0 z-0 opacity-30" />
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #000510 0%, #001a33 30%, #000510 60%, #0a001a 100%)' }}>
      <MatrixRain />
      <div className="pointer-events-none absolute inset-0 -z-5">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-15 blur-3xl" style={{ background: 'radial-gradient(circle, #00ff41, transparent 70%)' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: 'radial-gradient(circle, #a855f7, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-5 blur-3xl" style={{ background: 'radial-gradient(circle, #00e5ff, transparent 70%)' }} />
      </div>
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  )
}

// ── Forgot Password Modal ─────────────────────────────────────────────────
function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch<{ resetToken?: string; message?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.resetToken) {
        setResetToken(res.resetToken)
        setMessage('重置令牌已生成，请设置新密码')
        setStep('reset')
      } else {
        setMessage('如果该邮箱存在，重置链接已发送')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) { setError('密码至少 8 个字符'); return }
    setBusy(true)
    setError('')
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
      })
      setMessage('密码已重置，请返回登录')
      setTimeout(onClose, 2000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm mx-4 rounded-lg border border-cyan-900/50 bg-black/90 p-6 shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-cyan-400 mb-4 tracking-wider" style={{ textShadow: '0 0 10px rgba(0,229,255,0.5)' }}>
          {step === 'email' ? '重置密码' : '设置新密码'}
        </h2>
        {message && <p className="text-green-400 text-sm mb-3">{message}</p>}
        {step === 'email' ? (
          <form onSubmit={requestReset} className="space-y-3">
            <div>
              <Label className="text-xs text-cyan-300" htmlFor="reset-email">注册邮箱</Label>
              <Input id="reset-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="输入注册时使用的邮箱"
                className="border-cyan-900/50 bg-black/50 text-cyan-100 placeholder:text-cyan-800 focus:border-cyan-500 focus:ring-cyan-500/20" />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-black font-bold">
                {busy ? '发送中…' : '发送重置令牌'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} className="text-cyan-400">取消</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={doReset} className="space-y-3">
            <div>
              <Label className="text-xs text-cyan-300" htmlFor="new-pw">新密码</Label>
              <Input id="new-pw" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="至少 8 个字符"
                className="border-cyan-900/50 bg-black/50 text-cyan-100 placeholder:text-cyan-800 focus:border-cyan-500 focus:ring-cyan-500/20" />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-black font-bold">
                {busy ? '重置中…' : '确认重置'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} className="text-cyan-400">取消</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Auth Form ──────────────────────────────────────────────────────────────
function AuthForm({ mode, onAuthed }: { mode: 'setup' | 'login'; onAuthed: () => void }) {
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [codeRequired, setCodeRequired] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [internalMode, setInternalMode] = useState<'login' | 'register'>('login')

  const isSetup = mode === 'setup'
  const isRegister = mode === 'login' && internalMode === 'register'

  const usernameError = !username.trim() ? t('validation.required') : null
  const emailError = (isSetup || isRegister) && !email.trim() ? t('validation.required') : (isSetup || isRegister) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? t('validation.email') : null
  const passwordError = !password ? t('validation.required') : (isSetup || isRegister) && password.length < PASSWORD_MIN ? t('validation.passwordMin', { min: PASSWORD_MIN }) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (usernameError || ((isSetup || isRegister) && emailError) || passwordError) { setAttempted(true); return }
    setBusy(true)
    setError('')
    try {
      const payload: Record<string, string> = { username, password }
      if (isSetup || isRegister) {
        payload.email = email
        if (isSetup && setupCode) payload.setupCode = setupCode.trim()
      }
      const endpoint = isSetup ? '/api/auth/setup' : isRegister ? '/api/auth/register' : '/api/auth/login'
      const res = await apiFetch<{ token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setToken(res.token)
      onAuthed()
    } catch (err) {
      if (isSetup && (err as ApiError).code === 'setup_code_required') setCodeRequired(true)
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <div className="mb-8 flex items-center justify-center gap-3">
        <svg width="28" height="28" viewBox="0 0 64 64" className="shrink-0">
          <defs>
            <linearGradient id="auth-ring2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#00ff41"/>
              <stop offset="100%" stop-color="#a855f7"/>
            </linearGradient>
          </defs>
          <polygon points="32,8 52,20 52,44 32,56 12,44 12,20"
                   fill="none" stroke="url(#auth-ring2)" stroke-width="3"
                   stroke-linejoin="round" opacity="0.9"/>
          <path d="M20 28 L28 22 L28 32 L36 26 L36 36 L44 30"
                fill="none" stroke="#00ff41" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
          <circle cx="20" cy="28" r="2.5" fill="#00ff41"/>
          <circle cx="44" cy="30" r="2.5" fill="#a855f7"/>
        </svg>
        <span className="font-bold tracking-widest text-xl" style={{ textShadow: '0 0 20px rgba(0,255,65,0.5), 0 0 40px rgba(168,85,247,0.3)' }}>
          <span className="text-green-400">LLM</span><span className="text-purple-400">Router</span>
        </span>
      </div>

      <div className="relative rounded-lg border border-cyan-900/40 bg-black/80 backdrop-blur-md p-6 shadow-2xl shadow-cyan-500/5">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-cyan-500/5 to-purple-500/5 pointer-events-none" />
        <div className="relative">
          <h1 className="text-base font-bold text-cyan-400 mb-1 tracking-wide" style={{ textShadow: '0 0 10px rgba(0,229,255,0.3)' }}>
            {isSetup ? '首次配置' : isRegister ? '注册账户' : '系统登录'}
          </h1>
          <p className="text-xs text-cyan-700 mb-5">
            {isSetup ? '创建管理员账户以保护路由控制台' : isRegister ? '注册新账户，开始管理您的网关路由' : '输入凭据以管理您的网关路由'}
          </p>

          <form onSubmit={submit} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label className="text-xs text-cyan-300" htmlFor="auth-username">用户名</Label>
              <Input id="auth-username" type="text" autoComplete="username"
                value={username} onChange={e => setUsername(e.target.value)}
                placeholder="输入用户名"
                className="border-cyan-900/50 bg-black/50 text-cyan-100 placeholder:text-cyan-800 focus:border-cyan-500 focus:ring-cyan-500/20"
                aria-invalid={attempted && !!usernameError} />
              {attempted && <FieldError error={usernameError} />}
            </div>
            {(isSetup || isRegister) && (
              <div className="space-y-1.5">
                <Label className="text-xs text-cyan-300" htmlFor="auth-email">邮箱</Label>
                <Input id="auth-email" type="email" autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="border-cyan-900/50 bg-black/50 text-cyan-100 placeholder:text-cyan-800 focus:border-cyan-500 focus:ring-cyan-500/20"
                  aria-invalid={attempted && !!emailError} />
                {attempted && <FieldError error={emailError} />}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-cyan-300" htmlFor="auth-password">密码</Label>
              <Input id="auth-password" type="password"
                autoComplete={isSetup ? 'new-password' : 'current-password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder={isSetup ? '至少 8 个字符' : '输入密码'}
                className="border-cyan-900/50 bg-black/50 text-cyan-100 placeholder:text-cyan-800 focus:border-cyan-500 focus:ring-cyan-500/20"
                aria-invalid={attempted && !!passwordError} />
              {attempted && <FieldError error={passwordError} />}
            </div>
            {isSetup && codeRequired && (
              <div className="space-y-1.5">
                <Label className="text-xs text-cyan-300" htmlFor="auth-setup-code">设置码</Label>
                <Input id="auth-setup-code" type="text" autoComplete="off"
                  value={setupCode} onChange={e => setSetupCode(e.target.value)}
                  placeholder="服务器日志中的一次性设置码"
                  className="border-cyan-900/50 bg-black/50 text-cyan-100 placeholder:text-cyan-800 focus:border-cyan-500 focus:ring-cyan-500/20" />
                <p className="text-xs text-cyan-700">首次远程配置需要此码，本机访问自动跳过</p>
              </div>
            )}
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-black font-bold tracking-wide border-0" disabled={busy}
              style={{ boxShadow: '0 0 20px rgba(0,229,255,0.3)' }}>
              {busy ? (isSetup || isRegister ? '创建中…' : '验证中…') : isSetup ? '创建账户' : isRegister ? '注册' : '登 录'}
            </Button>
          </form>

          {mode === 'login' && !isRegister && (
            <div className="mt-3 text-center flex items-center justify-center gap-4">
              <button type="button" onClick={() => setShowForgot(true)}
                className="text-xs text-cyan-600 hover:text-cyan-400 transition-colors">
                忘记密码？
              </button>
              <button type="button" onClick={() => { setInternalMode('register'); setError(''); setAttempted(false) }}
                className="text-xs text-cyan-500 hover:text-cyan-300 transition-colors">
                没有账户？注册
              </button>
            </div>
          )}

          {mode === 'login' && isRegister && (
            <div className="mt-3 text-center">
              <button type="button" onClick={() => { setInternalMode('login'); setError(''); setAttempted(false) }}
                className="text-xs text-cyan-500 hover:text-cyan-300 transition-colors">
                已有账户？登录
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-cyan-900">
        LLMRouter v2 · 私有网关路由
      </p>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </Centered>
  )
}

// ── Auth Gate ──────────────────────────────────────────────────────────────
export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: () => apiFetch('/api/auth/status'),
    retry: false,
  })

  useEffect(() => {
    const handler = () => { refetch() }
    window.addEventListener(UNAUTHORIZED_EVENT, handler)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler)
  }, [refetch])

  function onAuthed() {
    queryClient.invalidateQueries()
    refetch()
  }

  if (isLoading) return <Centered><p className="text-sm text-cyan-400 animate-pulse">加载中…</p></Centered>
  if (isError || !data) {
    return (
      <Centered>
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2.5 text-xs text-red-400">
          无法连接服务器，请确认后端正在运行
        </div>
      </Centered>
    )
  }

  if (data.needsSetup) return <AuthForm mode="setup" onAuthed={onAuthed} />
  if (!data.authenticated) return <AuthForm mode="login" onAuthed={onAuthed} />

  return <>{children}</>
}

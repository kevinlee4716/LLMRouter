import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Moon, Sun, LogOut, User, Lock, Trash2, Plus, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch, logout } from '@/lib/api'
import { toast } from '@/lib/toast'
import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/i18n'

function getDarkPref() { return localStorage.getItem('theme') !== 'light' }

export default function SettingsPage() {
  const { dark, toggle: toggleDark } = (() => {
    const [d, setD] = useState(getDarkPref)
    return { dark: d, toggle: () => setD(v => { const n = !v; localStorage.setItem('theme', n ? 'dark' : 'light'); document.documentElement.classList.toggle('dark', n); return n }) }
  })()
  const { locale, setLocale } = useI18n()

  const { data: me } = useQuery<{ username: string; email: string }>({
    queryKey: ['auth-me'],
    queryFn: () => apiFetch('/api/auth/me'),
  })

  const { data: users, refetch: refetchUsers } = useQuery<{ id: number; username: string; email: string; created_at: string }[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/auth/users'),
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="text-sm text-muted-foreground mt-1">系统偏好、账户安全与用户管理</p>
      </div>

      {/* Appearance */}
      <Section icon={<Sun className="size-4" />} title="外观">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">主题模式</p>
            <p className="text-xs text-muted-foreground">切换深色/浅色显示</p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleDark}>
            {dark ? <Sun className="size-3.5 mr-1" /> : <Moon className="size-3.5 mr-1" />}
            {dark ? '浅色模式' : '深色模式'}
          </Button>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div>
            <p className="text-sm font-medium">界面语言</p>
            <p className="text-xs text-muted-foreground">切换显示语言</p>
          </div>
          <select
            value={locale}
            onChange={e => setLocale(e.target.value as Locale)}
            className="text-xs border rounded-md px-3 py-1.5 bg-background"
          >
            {SUPPORTED_LOCALES.map(code => (
              <option key={code} value={code}>{code === 'zh-CN' ? '中文 (简体)' : 'English'}</option>
            ))}
          </select>
        </div>
      </Section>

      {/* Account Security */}
      <Section icon={<Lock className="size-4" />} title="账户安全">
        <div className="text-xs text-muted-foreground mb-3">
          当前用户：<span className="font-mono text-foreground">{me?.username ?? '…'}</span>
          <span className="mx-2">|</span>
          <Mail className="size-3 inline mr-0.5" />{me?.email ?? '…'}
        </div>
        <ChangePasswordForm />
        <div className="mt-4">
          <ChangeUsernameForm currentUsername={me?.username ?? ''} />
        </div>
      </Section>

      {/* User Management */}
      <Section icon={<User className="size-4" />} title="用户管理">
        <p className="text-xs text-muted-foreground mb-3">管理系统中的用户账户</p>
        <div className="space-y-2 mb-4">
          {users?.map(u => (
            <div key={u.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
              <div>
                <span className="text-sm font-medium">{u.username}</span>
                <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
              </div>
              <DeleteUserButton userId={u.id} username={u.username} onDeleted={() => refetchUsers()} isSelf={u.username === me?.username} />
            </div>
          ))}
        </div>
        <AddUserDialog onAdded={() => refetchUsers()} />
      </Section>

      {/* Sign Out */}
      <Section icon={<LogOut className="size-4" />} title="退出">
        <p className="text-xs text-muted-foreground mb-3">退出当前会话，返回登录页面</p>
        <Button variant="destructive" size="sm" onClick={() => logout()}>
          <LogOut className="size-3.5 mr-1" />退出登录
        </Button>
      </Section>
    </div>
  )
}

// ── Section wrapper ─────────────────────────────────────────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ── Change Password ─────────────────────────────────────────────────
function ChangePasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!current || next.length < 8) { toast.error('请填写完整，新密码至少8个字符'); return }
    setBusy(true)
    try {
      await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) })
      toast.success('密码已修改')
      setCurrent(''); setNext('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Label className="text-xs">修改密码</Label>
      <div className="flex gap-2">
        <Input type="password" placeholder="当前密码" value={current} onChange={e => setCurrent(e.target.value)} className="flex-1 text-xs" />
        <Input type="password" placeholder="新密码（≥8位）" value={next} onChange={e => setNext(e.target.value)} className="flex-1 text-xs" />
        <Button type="submit" size="sm" disabled={busy}>{busy ? '修改中…' : '确认'}</Button>
      </div>
    </form>
  )
}

// ── Change Username ─────────────────────────────────────────────────
function ChangeUsernameForm({ currentUsername }: { currentUsername: string }) {
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) { toast.error('请输入新用户名'); return }
    setBusy(true)
    try {
      await apiFetch('/api/auth/change-username', { method: 'POST', body: JSON.stringify({ newUsername: newName.trim() }) })
      toast.success('用户名已修改，下次登录生效')
      setNewName('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Label className="text-xs">修改用户名（当前：{currentUsername}）</Label>
      <div className="flex gap-2">
        <Input type="text" placeholder="新用户名" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1 text-xs" />
        <Button type="submit" size="sm" disabled={busy}>{busy ? '修改中…' : '确认'}</Button>
      </div>
    </form>
  )
}

// ── Delete User ─────────────────────────────────────────────────────
function DeleteUserButton({ userId, username, onDeleted, isSelf }: { userId: number; username: string; onDeleted: () => void; isSelf: boolean }) {
  const del = useMutation({
    mutationFn: () => apiFetch(`/api/auth/users/${userId}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success(`用户 ${username} 已删除`); onDeleted() },
    onError: (err) => toast.error((err as Error).message),
  })

  return (
    <Button variant="ghost" size="icon" className="size-7" disabled={isSelf || del.isPending}
      onClick={() => { if (confirm(`确定删除用户 "${username}"？`)) del.mutate() }}
      title={isSelf ? '不能删除自己' : '删除用户'}>
      <Trash2 className="size-3.5" />
    </Button>
  )
}

// ── Add User ────────────────────────────────────────────────────────
function AddUserDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const create = useMutation({
    mutationFn: (data: any) => apiFetch('/api/auth/users', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast.success('用户已创建')
      setOpen(false)
      setUsername(''); setEmail(''); setPassword('')
      onAdded()
    },
    onError: (err) => toast.error((err as Error).message),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !email.trim() || password.length < 8) { toast.error('请完整填写所有字段'); return }
    create.mutate({ username, email, password })
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5 mr-1" />添加用户
      </Button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-lg border p-4 space-y-3 bg-muted/30">
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="用户名" value={username} onChange={e => setUsername(e.target.value)} className="text-xs" />
        <Input placeholder="邮箱" type="email" value={email} onChange={e => setEmail(e.target.value)} className="text-xs" />
        <Input placeholder="密码（≥8位）" type="password" value={password} onChange={e => setPassword(e.target.value)} className="text-xs" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>{create.isPending ? '创建中…' : '创建'}</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>取消</Button>
      </div>
    </form>
  )
}

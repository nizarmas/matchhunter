import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useApp } from '../context/AppContext'
import { lastEmail } from '../lib/store'
import { supabase } from '../lib/supabase'

export function AuthPage() {
  const { t, register, login, user, cloud } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(
    params.get('mode') === 'login' ? 'login' : 'register',
  )
  const [sent, setSent] = useState(false)
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [email, setEmail] = useState(user?.email ?? lastEmail())
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user?.onboardingComplete) return <Navigate to="/app" replace />
  if (user && mode === 'login') return <Navigate to="/onboarding" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'forgot') {
        if (!email.trim() || !supabase) {
          setError(t.authError)
          return
        }
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/reset`,
        })
        if (err) throw err
        setSent(true)
        return
      }
      if (mode === 'login') {
        if (!email.trim() || password.length < 6) {
          setError(t.authError)
          return
        }
        const p = await login(email.trim(), password)
        nav(p.onboardingComplete ? '/app' : '/onboarding')
        return
      }
      if (!name.trim() || phone.replace(/\D/g, '').length < 9) return
      if (cloud && (!email.trim() || password.length < 6)) {
        setError(t.authError)
        return
      }
      const p = await register(name.trim(), phone.trim(), email.trim() || undefined, password || undefined)
      nav(p.onboardingComplete ? '/app' : '/onboarding')
    } catch (err) {
      setError(err instanceof Error && err.message === 'blocked' ? t.accountBlocked : err instanceof Error ? err.message : t.authError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="noise grid min-h-dvh place-items-center px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-md rounded-[32px] bg-card p-7 shadow-sm ring-1 ring-ink/5">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="display text-3xl">
            {mode === 'forgot' ? t.forgotPassword : mode === 'login' ? t.login : t.register}
          </h1>
          <LanguageSwitcher compact />
        </div>
        {mode !== 'forgot' && (
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-full bg-mist p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-full py-2 text-sm font-bold ${mode === 'login' ? 'bg-wine text-paper' : ''}`}
            >
              {t.login}
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`rounded-full py-2 text-sm font-bold ${mode === 'register' ? 'bg-wine text-paper' : ''}`}
            >
              {t.register}
            </button>
          </div>
        )}
        <p className="mb-6 text-sm text-ink/60">{mode === 'forgot' ? t.resetSent : t.rememberHint}</p>
        {mode === 'register' && (
          <>
            <label className="mb-1 block text-sm font-semibold">{t.name}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-4 w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
            />
            <label className="mb-1 block text-sm font-semibold">{t.phone}</label>
            <input
              required
              inputMode="tel"
              placeholder="05…"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mb-4 w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
            />
          </>
        )}
        <label className="mb-1 block text-sm font-semibold">{t.email}</label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
        />
        {mode !== 'forgot' && (
          <>
            <label className="mb-1 block text-sm font-semibold">{t.password}</label>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="mb-4 w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
            />
          </>
        )}
        {sent && <p className="mb-4 text-sm font-semibold text-olive">{t.resetSent}</p>}
        {error && <p className="mb-4 text-sm text-wine">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-wine py-3.5 font-bold text-paper disabled:opacity-60"
        >
          {mode === 'forgot' ? t.forgotPassword : mode === 'login' ? t.login : t.continue}
        </button>
        {mode === 'login' && (
          <button
            type="button"
            onClick={() => {
              setMode('forgot')
              setSent(false)
              setError('')
            }}
            className="mt-4 w-full text-sm font-semibold text-wine"
          >
            {t.forgotPassword}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'register' ? 'login' : 'register')
            setSent(false)
          }}
          className="mt-4 w-full text-sm font-semibold text-wine"
        >
          {mode === 'register' ? t.haveAccount : t.needAccount}
        </button>
        <Link to="/" className="mt-3 block text-center text-sm text-ink/50">
          {t.back}
        </Link>
      </form>
    </div>
  )
}

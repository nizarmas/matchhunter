import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

export function ResetPasswordPage() {
  const { t } = useApp()
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || password.length < 6) {
      setError(t.authError)
      return
    }
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    nav('/auth?mode=login')
  }

  return (
    <div className="noise grid min-h-dvh place-items-center px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-md rounded-[32px] bg-card p-7 shadow-sm ring-1 ring-ink/5">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="display text-3xl">{t.resetTitle}</h1>
          <LanguageSwitcher compact />
        </div>
        {!ready && <p className="mb-4 text-sm text-ink/60">{t.resetSent}</p>}
        <label className="mb-1 block text-sm font-semibold">{t.password}</label>
        <input
          required
          type="password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="mb-4 w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
        />
        {error && <p className="mb-4 text-sm text-wine">{error}</p>}
        <button
          type="submit"
          disabled={busy || !ready}
          className="w-full rounded-2xl bg-wine py-3.5 font-bold text-paper disabled:opacity-60"
        >
          {t.savePassword}
        </button>
        <Link to="/auth?mode=login" className="mt-4 block text-center text-sm font-semibold text-wine">
          {t.login}
        </Link>
      </form>
    </div>
  )
}

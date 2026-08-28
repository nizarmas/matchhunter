import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { isMemberActive, MEMBER_MONTHS, MEMBER_PRICE_ILS } from '../lib/membership'
import type { PaymentSettings } from '../lib/payments'
import { SEED_PROFILES } from '../lib/seed'

export function AdminPage() {
  const {
    t,
    user,
    isAdmin,
    profiles,
    transactions,
    allMatches,
    adminSetBlocked,
    adminGrantPaid,
    adminMessage,
    adminChangeEmail,
    paymentSettings,
    adminSavePayments,
    adminDeleteCustomer,
    adminRevokeMembership,
    adminResetAllMemberships,
  } = useApp()
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [flash, setFlash] = useState('')
  const [nextEmail, setNextEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [payDraft, setPayDraft] = useState<PaymentSettings>(paymentSettings)
  const [payBusy, setPayBusy] = useState(false)

  useEffect(() => {
    setPayDraft(paymentSettings)
  }, [paymentSettings])

  const customers = useMemo(
    () =>
      profiles.filter((p) => !p.id.startsWith('seed-') && !SEED_PROFILES.some((s) => s.id === p.id)),
    [profiles],
  )

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const joinedMonth = customers.filter((p) => new Date(p.createdAt) >= monthStart).length
  const paid = customers.filter((p) => {
    const last = transactions
      .filter((tx) => tx.userId === p.id && tx.status === 'success')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    return isMemberActive(p.membershipUntil, last?.createdAt)
  }).length
  const revenue = transactions.filter((tx) => tx.status === 'success').reduce((sum, tx) => sum + tx.amount, 0)
  const blocked = customers.filter((p) => p.accountBlocked).length
  const approved = allMatches.filter((m) => m.status === 'partner_approved').length

  const shown = customers.filter((p) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return `${p.name} ${p.email ?? ''} ${p.phone}`.toLowerCase().includes(s)
  })

  if (!user) return <Navigate to="/auth?mode=login" replace />
  if (!isAdmin) return <Navigate to="/app" replace />

  function ping(id: string) {
    const body = draft[id]?.trim()
    if (!body) return
    adminMessage(id, body)
    setDraft((d) => ({ ...d, [id]: '' }))
    setFlash(t.messageSent)
    window.setTimeout(() => setFlash(''), 2000)
  }

  async function saveAdminEmail(e: FormEvent) {
    e.preventDefault()
    setEmailError('')
    const a = nextEmail.trim().toLowerCase()
    const b = confirmEmail.trim().toLowerCase()
    if (a !== b) {
      setEmailError(t.adminEmailMismatch)
      return
    }
    setEmailBusy(true)
    try {
      await adminChangeEmail(a)
      setNextEmail('')
      setConfirmEmail('')
      setFlash(t.adminEmailSaved)
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      setEmailError(
        code === 'email_not_registered'
          ? t.adminEmailNotRegistered
          : code === 'invalid_email'
            ? t.adminEmailInvalid
            : t.authError,
      )
    } finally {
      setEmailBusy(false)
    }
  }

  async function savePayments(e: FormEvent) {
    e.preventDefault()
    setPayBusy(true)
    try {
      await adminSavePayments(payDraft)
      setFlash(t.paySettingsSaved)
    } catch {
      setFlash(t.authError)
    } finally {
      setPayBusy(false)
    }
  }

  const stats = [
    { k: t.statsUsers, v: String(customers.length) },
    { k: t.statsMonth, v: String(joinedMonth) },
    { k: t.statsPaid, v: String(paid) },
    { k: t.statsRevenue, v: `₪${revenue}` },
    { k: t.statsBlocked, v: String(blocked) },
    { k: t.statsApproved, v: String(approved) },
  ]

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">{t.adminTitle}</h1>
      {flash && (
        <p className={`mt-3 text-sm font-semibold ${flash === t.resetAllMembershipsDone ? 'text-olive' : 'text-wine'}`}>
          {flash}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          if (!window.confirm(t.resetAllMembershipsConfirm)) return
          void adminResetAllMemberships()
            .then(() => setFlash(t.resetAllMembershipsDone))
            .catch((err) => setFlash(err instanceof Error ? err.message : t.authError))
        }}
        className="mt-4 rounded-2xl bg-wine px-4 py-3 text-sm font-bold text-paper"
      >
        {t.resetAllMemberships}
      </button>
      <form onSubmit={saveAdminEmail} className="mt-6 rounded-[28px] bg-card p-5 shadow-sm ring-1 ring-ink/5">
        <h2 className="text-lg font-bold">{t.adminEmailTitle}</h2>
        <p className="mt-1 text-sm text-ink/60">{t.adminEmailHint}</p>
        <p className="mt-2 text-sm font-semibold">{user.email}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            type="email"
            required
            autoComplete="off"
            value={nextEmail}
            onChange={(e) => setNextEmail(e.target.value)}
            placeholder={t.adminEmailNew}
            className="rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
          />
          <input
            type="email"
            required
            autoComplete="off"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={t.adminEmailConfirm}
            className="rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
          />
        </div>
        {emailError && <p className="mt-2 text-sm text-wine">{emailError}</p>}
        <button
          type="submit"
          disabled={emailBusy}
          className="mt-4 rounded-2xl bg-mist px-4 py-2 text-sm font-bold disabled:opacity-60"
        >
          {t.adminEmailSave}
        </button>
      </form>
      <form onSubmit={savePayments} className="mt-6 rounded-[28px] bg-card p-5 shadow-sm ring-1 ring-ink/5">
        <h2 className="text-lg font-bold">{t.payModeTitle}</h2>
        <p className="mt-1 text-sm text-ink/60">{t.payModeHint}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPayDraft((d) => ({ ...d, mode: 'simulation' }))}
            className={`rounded-2xl px-4 py-3 text-sm font-bold ${
              payDraft.mode === 'simulation' ? 'bg-gold text-ink' : 'bg-mist'
            }`}
          >
            {t.payModeSim}
          </button>
          <button
            type="button"
            onClick={() => setPayDraft((d) => ({ ...d, mode: 'live' }))}
            className={`rounded-2xl px-4 py-3 text-sm font-bold ${
              payDraft.mode === 'live' ? 'bg-olive text-paper' : 'bg-mist'
            }`}
          >
            {t.payModeLive}
          </button>
        </div>
        <label className="mt-4 block text-xs text-ink/50">{t.paypalAccount}</label>
        <input
          type="email"
          required
          value={payDraft.paypalEmail}
          onChange={(e) => setPayDraft((d) => ({ ...d, paypalEmail: e.target.value }))}
          className="mt-1 w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
        />
        <label className="mt-3 block text-xs text-ink/50">{t.paypalClientId}</label>
        <input
          value={payDraft.paypalClientId}
          onChange={(e) => setPayDraft((d) => ({ ...d, paypalClientId: e.target.value }))}
          placeholder="AY..."
          className="mt-1 w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
        />
        <label className="mt-3 block text-xs text-ink/50">{t.stripePk}</label>
        <input
          value={payDraft.stripePublishableKey}
          onChange={(e) => setPayDraft((d) => ({ ...d, stripePublishableKey: e.target.value }))}
          placeholder="pk_live_... / pk_test_..."
          className="mt-1 w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
        />
        {payDraft.mode === 'live' && !payDraft.paypalClientId.trim() && (
          <p className="mt-3 text-sm text-wine">{t.payLiveNeedKeys}</p>
        )}
        <button
          type="submit"
          disabled={payBusy}
          className="mt-4 rounded-2xl bg-wine px-4 py-2 text-sm font-bold text-paper disabled:opacity-60"
        >
          {t.paySettingsSave}
        </button>
      </form>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <div key={s.k} className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-ink/5">
            <p className="text-xs text-ink/50">{s.k}</p>
            <p className="mt-1 text-2xl font-bold">{s.v}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/45">
        {t.unlockFor} · ₪{MEMBER_PRICE_ILS} / {MEMBER_MONTHS}
      </p>
      <h2 className="mt-8 mb-3 text-lg font-bold">{t.customers}</h2>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t.searchCustomer}
        className="mb-4 w-full max-w-md rounded-2xl border border-mist bg-card px-4 py-3 outline-none ring-wine focus:ring-2"
      />
      {shown.length === 0 ? (
        <p className="rounded-3xl bg-card p-6 text-sm text-ink/55">{t.noCustomers}</p>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => {
            const last = transactions
              .filter((tx) => tx.userId === p.id && tx.status === 'success')
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
            const member = isMemberActive(p.membershipUntil, last?.createdAt)
            return (
              <article key={p.id} className="rounded-[28px] bg-card p-5 shadow-sm ring-1 ring-ink/5">
                <div>
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  <p className="text-sm text-ink/60">
                    {p.email ?? '—'} · {p.phone || '—'} · {p.questionnaire.age}
                  </p>
                  <p className="mt-1 text-xs">
                    {p.accountBlocked ? t.blockUser : member ? t.memberActive : t.unlockFor}
                    {p.membershipUntil
                      ? ` · ${new Date(p.membershipUntil).toLocaleDateString('he-IL')}`
                      : ''}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => adminGrantPaid(p.id)}
                    className="rounded-full bg-olive px-3 py-1.5 text-xs font-bold text-paper"
                  >
                    {t.grantPaid}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void adminRevokeMembership(p.id)
                        .then(() => setFlash(t.membershipRevoked))
                        .catch(() => setFlash(t.authError))
                    }}
                    className="rounded-full bg-mist px-3 py-1.5 text-xs font-bold"
                  >
                    {t.revokePaid}
                  </button>
                  <button
                    type="button"
                    onClick={() => adminSetBlocked(p.id, !p.accountBlocked)}
                    className="rounded-full bg-mist px-3 py-1.5 text-xs font-bold"
                  >
                    {p.accountBlocked ? t.unblockUser : t.blockUser}
                  </button>
                </div>
                {p.id !== user.id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`${t.deleteCustomerConfirm} (${p.name})`)) return
                      void adminDeleteCustomer(p.id)
                        .then(() => setFlash(t.customerDeleted))
                        .catch(() => setFlash(t.authError))
                    }}
                    className="mt-3 w-full rounded-2xl bg-wine py-2.5 text-sm font-bold text-paper"
                  >
                    {t.deleteCustomer}
                  </button>
                )}
                <div className="mt-3 flex gap-2">
                  <input
                    value={draft[p.id] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    placeholder={t.sendToClient}
                    className="flex-1 rounded-2xl bg-paper px-3 py-2 text-sm outline-none ring-wine focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => ping(p.id)}
                    className="rounded-2xl bg-wine px-3 py-2 text-sm font-bold text-paper"
                  >
                    {t.send}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { tPath } from '../i18n/translations'
import { LANG_LABEL } from '../lib/seed'

export function ProfilePage() {
  const { t, lang, user, logout, hasMembership } = useApp()
  const nav = useNavigate()
  if (!user) return null
  const q = user.questionnaire
  const until = user.membershipUntil
    ? new Date(user.membershipUntil).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar' : 'he-IL')
    : null

  return (
    <div className="mx-auto max-w-lg rounded-[32px] bg-card p-7 shadow-sm ring-1 ring-ink/5">
      <h1 className="display text-3xl">{user.name}</h1>
      <p className="mt-1 text-ink/60">{user.email ?? t.email}</p>
      <p className="text-ink/60">{user.phone}</p>
      <p className="mt-3 rounded-2xl bg-mist px-4 py-3 text-sm font-semibold">
        {hasMembership ? `${t.memberActive}${until ? ` · ${until}` : ''}` : t.unlockFor}
      </p>
      {user.onboardingComplete && (
        <dl className="mt-6 space-y-2 text-sm">
          <Row k={t.q3} v={String(q.age)} />
          <Row k={t.q5} v={`${tPath(lang, `region.${q.region}`)}${q.city ? ` · ${q.city}` : ''}`} />
          <Row k={t.q6} v={tPath(lang, `faith.${q.faith}`)} />
          <Row k={t.q7} v={tPath(lang, `goal.${q.goal}`)} />
          <Row k={t.languagesSpoken} v={q.languages.map((l) => LANG_LABEL[l][lang]).join(' · ')} />
          {q.bio && <Row k={t.bio} v={q.bio} />}
        </dl>
      )}
      <div className="mt-8 flex flex-col gap-2">
        <Link to="/onboarding" className="rounded-2xl bg-mist py-3 text-center font-semibold">
          {t.editQ}
        </Link>
        <button
          type="button"
          onClick={() => {
            logout()
            nav('/')
          }}
          className="rounded-2xl bg-wine py-3 font-bold text-paper"
        >
          {t.logout}
        </button>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-mist/80 py-2">
      <dt className="text-ink/50">{k}</dt>
      <dd className="text-end font-medium">{v}</dd>
    </div>
  )
}

import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { tPath } from '../i18n/translations'
import { isMemberActive } from '../lib/membership'
import { LANG_LABEL } from '../lib/seed'

export function ProfilePage() {
  const { profileId } = useParams()
  const { t, lang, user, logout, hasMembership, isAdmin, profileById, transactions } = useApp()
  const nav = useNavigate()
  if (!user) return null

  const fromAdmin = Boolean(profileId)
  if (fromAdmin && !isAdmin) return <Navigate to="/app" replace />

  const person = fromAdmin ? profileById(profileId!) : user
  if (!person) {
    return (
      <div className="rounded-3xl bg-card p-8">
        <p className="text-ink/60">{t.noCustomers}</p>
        <Link to="/app/admin" className="mt-4 inline-block font-semibold text-wine">
          {t.backToCustomers}
        </Link>
      </div>
    )
  }

  const last = transactions
    .filter((tx) => tx.userId === person.id && tx.status === 'success')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const member = fromAdmin ? isMemberActive(person.membershipUntil, last?.createdAt) : hasMembership
  const until = person.membershipUntil
    ? new Date(person.membershipUntil).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar' : 'he-IL')
    : null
  const q = person.questionnaire
  const locale = lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar' : 'he-IL'

  return (
    <div className="mx-auto max-w-lg rounded-[32px] bg-card p-7 shadow-sm ring-1 ring-ink/5">
      {fromAdmin && (
        <Link to="/app/admin" className="mb-4 inline-block text-sm font-semibold text-wine">
          ← {t.backToCustomers}
        </Link>
      )}
      <h1 className="display text-3xl">{person.name}</h1>
      <p className="mt-1 text-ink/60">{person.email ?? t.email}</p>
      <p className="text-ink/60">{person.phone || '—'}</p>
      <p className="mt-3 rounded-2xl bg-mist px-4 py-3 text-sm font-semibold">
        {person.accountBlocked
          ? t.blockUser
          : member
            ? `${t.memberActive}${until ? ` · ${until}` : ''}`
            : t.unlockFor}
      </p>
      {person.onboardingComplete ? (
        <dl className="mt-6 space-y-2 text-sm">
          <Row k={t.q1} v={tPath(lang, q.gender === 'male' ? 'male' : 'female')} />
          <Row k={t.q2} v={tPath(lang, q.lookingFor === 'male' ? 'man' : 'woman')} />
          <Row k={t.q3} v={String(q.age)} />
          <Row k={t.q4} v={`${q.partnerAgeMin}–${q.partnerAgeMax}`} />
          <Row k={t.q5} v={`${tPath(lang, `region.${q.region}`)}${q.city ? ` · ${q.city}` : ''}`} />
          <Row k={t.q6} v={tPath(lang, `faith.${q.faith}`)} />
          {q.openToOtherFaiths && <Row k={t.openFaith} v="✓" />}
          <Row k={t.q7} v={tPath(lang, `goal.${q.goal}`)} />
          <Row k={t.kidsLabel} v={tPath(lang, `kids.${q.kids}`)} />
          <Row k={t.languagesSpoken} v={q.languages.map((l) => LANG_LABEL[l][lang]).join(' · ')} />
          {q.bio && <Row k={t.bio} v={q.bio} />}
          <Row k={t.joinedAt} v={new Date(person.createdAt).toLocaleDateString(locale)} />
        </dl>
      ) : (
        <p className="mt-6 text-sm text-ink/55">{t.questionnairePending}</p>
      )}
      {fromAdmin ? (
        <Link to="/app/admin" className="mt-8 block rounded-2xl bg-mist py-3 text-center font-semibold">
          {t.backToCustomers}
        </Link>
      ) : (
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
      )}
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

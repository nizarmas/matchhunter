import { HeartHandshake } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useApp } from '../context/AppContext'

export function WelcomePage() {
  const { t, user } = useApp()
  const inbox = user?.onboardingComplete ? '/app' : user ? '/onboarding' : '/auth?mode=register'
  return (
    <div className="noise min-h-dvh px-5 py-6 md:px-10">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-5xl flex-col justify-between gap-10 md:flex-row md:items-center">
        <div className="max-w-xl">
          <div className="mb-8 flex items-center justify-between gap-4 md:justify-start">
            <div className="flex items-center gap-2 text-wine">
              <HeartHandshake className="size-7" />
              <span className="text-lg font-bold">{t.brand}</span>
            </div>
            <LanguageSwitcher />
          </div>
          <p className="text-sm font-semibold tracking-wide text-gold">{t.mustRegister}</p>
          <h1 className="display mt-3 text-4xl leading-[1.15] font-semibold md:text-6xl">{t.tagline}</h1>
          <p className="mt-3 text-sm text-ink/55">{t.desktop}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to={inbox}
              className="rounded-2xl bg-wine px-8 py-3.5 text-center text-base font-bold text-paper"
            >
              {user ? t.matches : t.start}
            </Link>
            {!user && (
              <Link
                to="/auth?mode=login"
                className="rounded-2xl bg-mist px-8 py-3.5 text-center text-base font-bold"
              >
                {t.login}
              </Link>
            )}
          </div>
        </div>
        <div className="grid max-w-md gap-3">
          {[
            { n: '01', title: t.qTitle },
            { n: '02', title: t.unlockFor, body: t.unlockExplain },
          ].map((step) => (
            <div key={step.n} className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-ink/5">
              <div className="text-xs font-bold text-gold">{step.n}</div>
              <p className="mt-1 font-semibold">{step.title}</p>
              {step.body ? <p className="mt-1 text-sm text-ink/60">{step.body}</p> : null}
            </div>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-5xl text-center text-xs text-ink/45">{t.footer}</p>
    </div>
  )
}

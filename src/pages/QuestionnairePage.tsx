import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { REGIONS } from '../lib/regions'
import { LANG_LABEL } from '../lib/seed'
import type { Faith, Gender, Goal, Kids, Lang, Questionnaire } from '../lib/types'
import { tPath } from '../i18n/translations'

const FAITHS: Faith[] = [
  'jewish_secular',
  'jewish_traditional',
  'jewish_religious',
  'jewish_haredi',
  'muslim',
  'christian',
  'druze',
  'other',
]
const GOALS: Goal[] = ['marriage', 'serious', 'slowly']
const KIDS: Kids[] = ['want', 'have', 'open', 'no']

export function QuestionnairePage() {
  const { t, lang, user, saveQuestionnaire } = useApp()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [q, setQ] = useState<Questionnaire>(
    user?.questionnaire ?? {
      gender: 'female',
      lookingFor: 'male',
      age: 28,
      partnerAgeMin: 25,
      partnerAgeMax: 40,
      region: 'jerusalem',
      city: '',
      faith: 'jewish_traditional',
      openToOtherFaiths: false,
      goal: 'marriage',
      kids: 'open',
      languages: [lang],
      bio: '',
    },
  )

  const total = 7
  const progress = ((step + 1) / total) * 100

  function next() {
    if (step < total - 1) setStep(step + 1)
    else {
      saveQuestionnaire(q)
      nav('/app')
    }
  }

  const regionHint = useMemo(
    () => REGIONS.find((r) => r.id === q.region)?.cityHints[lang] ?? '',
    [q.region, lang],
  )

  return (
    <div className="noise min-h-dvh px-4 py-6 md:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold text-gold">{t.qTitle}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
          <div className="h-full bg-wine transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-8 rounded-[32px] bg-card p-6 shadow-sm ring-1 ring-ink/5 md:p-8">
          {step === 0 && (
            <Step title={t.q1}>
              <Pick
                value={q.gender}
                onChange={(gender: Gender) => setQ({ ...q, gender })}
                options={[
                  { id: 'female', label: t.female },
                  { id: 'male', label: t.male },
                ]}
              />
            </Step>
          )}
          {step === 1 && (
            <Step title={t.q2}>
              <Pick
                value={q.lookingFor}
                onChange={(lookingFor: Gender) => setQ({ ...q, lookingFor })}
                options={[
                  { id: 'male', label: t.man },
                  { id: 'female', label: t.woman },
                ]}
              />
            </Step>
          )}
          {step === 2 && (
            <Step title={`${t.q3} — ${q.age}`}>
              <input
                type="range"
                min={18}
                max={80}
                value={q.age}
                onChange={(e) => setQ({ ...q, age: Number(e.target.value) })}
                className="w-full accent-wine"
              />
            </Step>
          )}
          {step === 3 && (
            <Step title={`${t.q4} — ${q.partnerAgeMin}–${q.partnerAgeMax}`}>
              <label className="text-sm">{t.from}</label>
              <input
                type="range"
                min={18}
                max={80}
                value={q.partnerAgeMin}
                onChange={(e) =>
                  setQ({ ...q, partnerAgeMin: Math.min(Number(e.target.value), q.partnerAgeMax) })
                }
                className="mb-4 w-full accent-wine"
              />
              <label className="text-sm">{t.to}</label>
              <input
                type="range"
                min={18}
                max={80}
                value={q.partnerAgeMax}
                onChange={(e) =>
                  setQ({ ...q, partnerAgeMax: Math.max(Number(e.target.value), q.partnerAgeMin) })
                }
                className="w-full accent-wine"
              />
            </Step>
          )}
          {step === 4 && (
            <Step title={t.q5}>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setQ({ ...q, region: r.id })}
                    className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
                      q.region === r.id ? 'bg-wine text-paper' : 'bg-mist text-ink'
                    }`}
                  >
                    {tPath(lang, `region.${r.id}`)}
                  </button>
                ))}
              </div>
              <input
                value={q.city}
                onChange={(e) => setQ({ ...q, city: e.target.value })}
                placeholder={`${t.city} · ${regionHint}`}
                className="mt-4 w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
              />
            </Step>
          )}
          {step === 5 && (
            <Step title={t.q6}>
              <div className="grid gap-2">
                {FAITHS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setQ({ ...q, faith: f })}
                    className={`rounded-2xl px-4 py-3 text-start text-sm font-semibold ${
                      q.faith === f ? 'bg-wine text-paper' : 'bg-mist'
                    }`}
                  >
                    {tPath(lang, `faith.${f}`)}
                  </button>
                ))}
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={q.openToOtherFaiths}
                  onChange={(e) => setQ({ ...q, openToOtherFaiths: e.target.checked })}
                />
                {t.openFaith}
              </label>
            </Step>
          )}
          {step === 6 && (
            <Step title={t.q7}>
              <p className="mb-2 text-sm font-semibold text-ink/60">{t.goal.marriage}</p>
              <Pick
                value={q.goal}
                onChange={(goal: Goal) => setQ({ ...q, goal })}
                options={GOALS.map((g) => ({ id: g, label: tPath(lang, `goal.${g}`) }))}
              />
              <p className="mt-5 mb-2 text-sm font-semibold text-ink/60">{t.kids.want}</p>
              <Pick
                value={q.kids}
                onChange={(kids: Kids) => setQ({ ...q, kids })}
                options={KIDS.map((k) => ({ id: k, label: tPath(lang, `kids.${k}`) }))}
              />
              <p className="mt-5 mb-2 text-sm font-semibold text-ink/60">{t.languagesSpoken}</p>
              <div className="flex flex-wrap gap-2">
                {(['he', 'ar', 'en'] as Lang[]).map((l) => {
                  const on = q.languages.includes(l)
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() =>
                        setQ({
                          ...q,
                          languages: on ? q.languages.filter((x) => x !== l) : [...q.languages, l],
                        })
                      }
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${on ? 'bg-olive text-paper' : 'bg-mist'}`}
                    >
                      {LANG_LABEL[l][lang]}
                    </button>
                  )
                })}
              </div>
              <label className="mt-5 mb-1 block text-sm font-semibold">{t.bio}</label>
              <textarea
                rows={3}
                value={q.bio}
                onChange={(e) => setQ({ ...q, bio: e.target.value })}
                placeholder={t.bioPh}
                className="w-full rounded-2xl border border-mist bg-paper px-4 py-3 outline-none ring-wine focus:ring-2"
              />
            </Step>
          )}

          <div className="mt-8 flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="rounded-2xl bg-mist px-5 py-3 font-semibold"
              >
                {t.back}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="flex-1 rounded-2xl bg-wine py-3 font-bold text-paper"
            >
              {step === total - 1 ? t.done : t.continue}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="display mb-6 text-3xl">{title}</h2>
      {children}
    </div>
  )
}

function Pick<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-2xl px-4 py-6 text-lg font-bold ${value === o.id ? 'bg-wine text-paper' : 'bg-mist'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

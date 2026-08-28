import { useApp } from '../context/AppContext'
import type { Lang } from '../lib/types'

const LABELS: Record<Lang, string> = { he: 'עב', ar: 'عر', en: 'EN' }

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useApp()
  return (
    <div className={`inline-flex rounded-full bg-mist/80 p-1 ${compact ? '' : 'shadow-sm'}`}>
      {(['he', 'ar', 'en'] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
            lang === l ? 'bg-wine text-paper' : 'text-ink/70 hover:text-ink'
          }`}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  )
}

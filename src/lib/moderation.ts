function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const BANNED = [
  'מטומטם',
  'מטומטמת',
  'אידיוט',
  'אידיוטית',
  'דפוק',
  'דפוקה',
  'מניאק',
  'מניאקית',
  'חרא',
  'זין',
  'כוס',
  'זונה',
  'שרמוטה',
  'בן זונה',
  'בת זונה',
  'יא חיה',
  'תמות',
  'תמותי',
  'לך תזדיין',
  'לכי תזדייני',
  'נבל',
  'בהמה',
  'idiot',
  'stupid',
  'fuck',
  'fucker',
  'shit',
  'bitch',
  'asshole',
  'whore',
  'slut',
  'kill yourself',
  'kys',
  'retard',
  'احمق',
  'غبي',
  'حقير',
  'كلب',
  'شرموطة',
  'قحبة',
  'عرص',
  'متخلف',
  'يلعن',
  'انقلع',
]

export function isOffensive(text: string) {
  const n = normalize(text)
  if (!n) return false
  const compact = n.replace(/\s/g, '')
  return BANNED.some((raw) => {
    const w = normalize(raw)
    if (!w) return false
    if (w.includes(' ')) return n.includes(w)
    return n.split(' ').includes(w) || compact.includes(w.replace(/\s/g, ''))
  })
}

export type ModerationResult = 'ok' | 'warned' | 'blocked'

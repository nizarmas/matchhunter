import type { Lang, Region } from './types'

export type RegionOption = {
  id: Region
  cityHints: Record<Lang, string>
}

export const REGIONS: RegionOption[] = [
  { id: 'jerusalem', cityHints: { he: 'ירושלים, מעלה אדומים, גבעת זאב', ar: 'القدس، أبو غوش', en: 'Jerusalem, Maale Adumim' } },
  { id: 'tel_aviv', cityHints: { he: 'תל אביב, יפו, רמת גן', ar: 'تل أبيب، يافا', en: 'Tel Aviv, Jaffa, Ramat Gan' } },
  { id: 'center', cityHints: { he: 'פתח תקווה, ראשון, מודיעין, רחובות', ar: 'اللد، الرملة، موديعين', en: 'Petah Tikva, Rishon, Modiin' } },
  { id: 'sharon', cityHints: { he: 'נתניה, הרצליה, כפר סבא, רעננה', ar: 'نتانيا، هرتسليا', en: 'Netanya, Herzliya, Kfar Saba' } },
  { id: 'haifa', cityHints: { he: 'חיפה, קריות, טירת כרמל', ar: 'حيفا، القرى', en: 'Haifa, Krayot' } },
  { id: 'north', cityHints: { he: 'נצרת, טבריה, צפת, כרמיאל, עכו', ar: 'الناصرة، عكا، طبريا', en: 'Nazareth, Tiberias, Safed, Acre' } },
  { id: 'south', cityHints: { he: 'באר שבע, אשקלון, אשדוד, דימונה', ar: 'بئر السبع، عسقلان', en: 'Beersheba, Ashkelon, Ashdod' } },
  { id: 'eilat', cityHints: { he: 'אילת והערבה', ar: 'إيلات', en: 'Eilat and Arava' } },
  { id: 'west_bank', cityHints: { he: 'אריאל, גוש עציון, ביתר, רמאללה, בית לחם, שכם, חברון, יריחו', ar: 'رام الله، بيت لحم، نابلس، الخليل، أريحا، أريئيل', en: 'Ariel, Gush Etzion, Ramallah, Bethlehem, Nablus, Hebron' } },
]

export const ADJACENT_REGIONS: Record<Region, Region[]> = {
  jerusalem: ['west_bank', 'center'],
  tel_aviv: ['center', 'sharon'],
  center: ['tel_aviv', 'jerusalem', 'sharon', 'south'],
  sharon: ['tel_aviv', 'center', 'haifa'],
  haifa: ['north', 'sharon'],
  north: ['haifa'],
  south: ['center', 'eilat', 'west_bank'],
  eilat: ['south'],
  west_bank: ['jerusalem', 'center', 'south'],
}

export const UNLOCK_PRICE_ILS = 39

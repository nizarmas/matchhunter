export type Lang = 'he' | 'ar' | 'en'
export type Gender = 'male' | 'female'
export type Region =
  | 'jerusalem'
  | 'tel_aviv'
  | 'center'
  | 'sharon'
  | 'haifa'
  | 'north'
  | 'south'
  | 'eilat'
  | 'west_bank'
export type Faith =
  | 'jewish_secular'
  | 'jewish_traditional'
  | 'jewish_religious'
  | 'jewish_haredi'
  | 'muslim'
  | 'christian'
  | 'druze'
  | 'other'
export type Goal = 'marriage' | 'serious' | 'slowly'
export type Kids = 'want' | 'have' | 'open' | 'no'
export type MatchStatus =
  | 'pending'
  | 'selected_and_paid'
  | 'partner_approved'
  | 'declined'

export type Questionnaire = {
  gender: Gender
  lookingFor: Gender
  age: number
  partnerAgeMin: number
  partnerAgeMax: number
  region: Region
  city: string
  faith: Faith
  openToOtherFaiths: boolean
  goal: Goal
  kids: Kids
  languages: Lang[]
  bio: string
}

export type Profile = {
  id: string
  phone: string
  name: string
  email?: string
  photo?: string
  questionnaire: Questionnaire
  onboardingComplete: boolean
  membershipUntil?: string
  chatWarnings?: number
  chatBlocked?: boolean
  accountBlocked?: boolean
  createdAt: string
}

export type Match = {
  id: string
  userId: string
  candidateId: string
  score: number
  reasons: string[]
  status: MatchStatus
  createdAt: string
  paidAt?: string
  approvedAt?: string
}

export type Transaction = {
  id: string
  userId: string
  matchId?: string
  amount: number
  currency: 'ILS'
  gateway: 'paypal' | 'demo' | 'admin'
  paymentGatewayId: string
  status: 'success' | 'failed' | 'pending'
  createdAt: string
}

export type ChatMessage = {
  id: string
  matchId: string
  senderId: string
  body: string
  createdAt: string
}

export type AppNotification = {
  id: string
  userId: string
  matchId?: string
  type: 'interest' | 'approved' | 'declined' | 'message' | 'admin'
  body: string
  read: boolean
  createdAt: string
}

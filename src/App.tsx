import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Shell } from './components/Shell'
import { useApp } from './context/AppContext'
import { AdminPage } from './pages/AdminPage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { AuthPage } from './pages/AuthPage'
import { ChatPage } from './pages/ChatPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProfilePage } from './pages/ProfilePage'
import { QuestionnairePage } from './pages/QuestionnairePage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { UnlockPage } from './pages/UnlockPage'
import { WelcomePage } from './pages/WelcomePage'

function Guard({ children, needOnboarding = false }: { children: ReactNode; needOnboarding?: boolean }) {
  const { user } = useApp()
  if (!user) return <Navigate to="/auth" replace />
  if (needOnboarding && !user.onboardingComplete) return <Navigate to="/onboarding" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/reset" element={<ResetPasswordPage />} />
      <Route
        path="/onboarding"
        element={
          <Guard>
            <QuestionnairePage />
          </Guard>
        }
      />
      <Route
        path="/app"
        element={
          <Guard needOnboarding>
            <Shell />
          </Guard>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="unlock/:matchId" element={<UnlockPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="chat/:matchId" element={<ChatPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

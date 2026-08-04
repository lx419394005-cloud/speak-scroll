import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { Game } from './game/Game'
import { HomePage } from './pages/HomePage'
import { HowToPage } from './pages/HowToPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="play" element={<Game />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="how-to" element={<HowToPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import SelectPage from './pages/SelectPage'
import LoadingPage from './pages/LoadingPage'
import ResultPage from './pages/ResultPage'
import DebatePage from './pages/DebatePage'
import MyDistillationsPage from './pages/MyDistillationsPage'
import ArenaPage from './pages/ArenaPage'
import ArenaDebateViewPage from './pages/ArenaDebateViewPage'
import BarPage from './pages/BarPage'
import LeaderboardPage from './pages/LeaderboardPage'
import Layout from './components/Layout'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/select" element={<SelectPage />} />
        <Route path="/loading" element={<LoadingPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/debate" element={<DebatePage />} />
        <Route path="/my-distillations" element={<MyDistillationsPage />} />
        <Route path="/arena" element={<ArenaPage />} />
        <Route path="/arena/:topicId" element={<ArenaDebateViewPage />} />
        <Route path="/bar" element={<BarPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
      </Routes>
    </Layout>
  )
}

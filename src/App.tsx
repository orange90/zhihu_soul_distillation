import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import SelectPage from './pages/SelectPage'
import LoadingPage from './pages/LoadingPage'
import ResultPage from './pages/ResultPage'
import Layout from './components/Layout'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/select" element={<SelectPage />} />
        <Route path="/loading" element={<LoadingPage />} />
        <Route path="/result" element={<ResultPage />} />
      </Routes>
    </Layout>
  )
}

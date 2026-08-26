import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.tsx'
import ProjectPage from './pages/ProjectPage.tsx'
import ProfilePage from './pages/ProfilePage.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/projects/:id" element={<ProjectPage />} />
      <Route path="/u/:id" element={<ProfilePage />} />
    </Routes>
  )
}

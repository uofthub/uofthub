import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage.tsx'
import ProjectPage from './pages/ProjectPage.tsx'
import ProfilePage from './pages/ProfilePage.tsx'
import CreateProjectPage from './pages/CreateProjectPage.tsx'
import CoursePage from './pages/CoursePage.tsx'
import OrgPage from './pages/OrgPage.tsx'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects/new" element={<CreateProjectPage />} />
        <Route path="/projects/:id" element={<ProjectPage />} />
        <Route path="/u/:id" element={<ProfilePage />} />
        <Route path="/courses/:tag" element={<CoursePage />} />
        <Route path="/orgs/:slug" element={<OrgPage />} />
      </Routes>
    </Layout>
  )
}

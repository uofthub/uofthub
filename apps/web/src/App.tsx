import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage.tsx'
import SessionPage from './pages/SessionPage.tsx'
import DirectoryPage from './pages/DirectoryPage.tsx'
import DiscoverPage from './pages/DiscoverPage.tsx'
import ProjectPage from './pages/ProjectPage.tsx'
import CreateProjectPage from './pages/CreateProjectPage.tsx'
import ProfilePage from './pages/ProfilePage.tsx'
import CoursePage from './pages/CoursePage.tsx'
import OrgsPage from './pages/OrgsPage.tsx'
import OrgPage from './pages/OrgPage.tsx'
import AboutPage from './pages/AboutPage.tsx'
import TermsPage from './pages/TermsPage.tsx'
import PrivacyPage from './pages/PrivacyPage.tsx'
import AdminPage from './pages/AdminPage.tsx'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/session" element={<SessionPage />} />
        <Route path="/projects" element={<DirectoryPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/projects/new" element={<CreateProjectPage />} />
        <Route path="/projects/:id" element={<ProjectPage />} />
        <Route path="/orgs" element={<OrgsPage />} />
        <Route path="/orgs/:slug" element={<OrgPage />} />
        <Route path="/u/:id" element={<ProfilePage />} />
        <Route path="/courses/:tag" element={<CoursePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

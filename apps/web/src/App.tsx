import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell } from './components/shell'
import { Spinner } from './components/ui'
import HomePage from './pages/home/HomePage'
import ExplorePage from './pages/explore/ExplorePage'
import ProjectPage from './pages/project/ProjectPage'
import PostPage from './pages/post/PostPage'
import ProfilePage from './pages/profile/ProfilePage'
import SessionPage from './pages/session/SessionPage'
import OrgsPage from './pages/orgs/OrgsPage'
import OrgPage from './pages/orgs/OrgPage'
import AboutPage from './pages/info/AboutPage'
import TermsPage from './pages/info/TermsPage'
import PrivacyPage from './pages/info/PrivacyPage'
import { HelpWantedPage, SavedPage } from './pages/lists/ListPages'

// Pages most visits never open are loaded when first needed, which keeps them
// out of the bundle every visitor downloads.
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))
const DiscoverPage = lazy(() => import('./pages/info/DiscoverPage'))
const CollectionsPage = lazy(() => import('./pages/collections/CollectionsPage'))
const CollectionPage = lazy(() => import('./pages/collections/CollectionPage'))
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'))

/** The old directory lived at /projects; its links now land on Explore. */
function ToExplore() {
  const { search } = useLocation()
  return <Navigate to={`/explore${search}`} replace />
}

/** /courses/CSC309 was the old per-course page. */
function CourseToExplore() {
  const { tag = '' } = useParams()
  return <Navigate to={`/explore?course=${encodeURIComponent(tag)}`} replace />
}

/**
 * What counts as "a new page" for the entrance animation. Moving between
 * conversations stays on Messages, so it doesn't replay the whole page.
 */
function pageKey(pathname: string) {
  return pathname.startsWith('/messages') ? '/messages' : pathname
}

export default function App() {
  const { pathname } = useLocation()
  return (
    <AppShell>
      <Suspense fallback={<Spinner />}>
        <div key={pageKey(pathname)} className="page-in">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/projects" element={<ToExplore />} />
            <Route path="/projects/new" element={<PostPage />} />
            <Route path="/projects/:id" element={<ProjectPage />} />
            <Route path="/courses/:tag" element={<CourseToExplore />} />
            <Route path="/u/:id" element={<ProfilePage />} />
            <Route path="/session" element={<SessionPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/orgs" element={<OrgsPage />} />
            <Route path="/orgs/:slug" element={<OrgPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:userId" element={<MessagesPage />} />
            <Route path="/help-wanted" element={<HelpWantedPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Suspense>
    </AppShell>
  )
}

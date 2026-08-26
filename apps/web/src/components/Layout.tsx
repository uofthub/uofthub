import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import uoftHubLogo from '../assets/uofthub-logo.svg'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <img src={uoftHubLogo} alt="uofthub" className="h-7 w-auto" />
          </Link>

          <nav className="flex items-center gap-4">
            {!loading && (
              user ? (
                <>
                  <Link
                    to={`/u/${user.id}`}
                    className="text-sm text-gray-700 hover:text-blue-900 font-medium"
                  >
                    {user.name}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-gray-500 hover:text-gray-900"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <a
                  href={`${API_URL}/auth/microsoft`}
                  className="text-sm bg-blue-900 text-white px-4 py-1.5 rounded-md hover:bg-blue-800 transition-colors"
                >
                  Sign in with UofT
                </a>
              )
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        {children}
      </main>

      <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-400">
        uofthub — open-source home for U of T student projects
      </footer>
    </div>
  )
}

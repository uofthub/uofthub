import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import uoftHubMark from '../assets/uofthub-mark.svg'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      <header style={{ backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
        className="sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <img src={uoftHubMark} alt="" aria-hidden="true" className="h-8 w-auto" />
            <span className="font-medium text-white text-lg tracking-tight">uofthub</span>
          </Link>

          <nav className="flex items-center gap-4">
            {!loading && (
              user ? (
                <>
                  <Link to={`/u/${user.id}`}
                    className="text-sm text-[#aaa] hover:text-white font-medium no-underline transition-colors">
                    {user.name}
                  </Link>
                  <button onClick={handleLogout}
                    className="text-sm text-[#666] hover:text-[#aaa] transition-colors cursor-pointer">
                    Sign out
                  </button>
                </>
              ) : (
                <a href={`${API_URL}/auth/microsoft`}
                  className="text-sm no-underline px-4 py-1.5 rounded-lg font-medium transition-colors"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}>
                  Sign in with UofT
                </a>
              )
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full">
        {children}
      </main>

      <footer style={{ borderTop: '1px solid var(--color-border)' }}
        className="py-6 text-center text-sm text-[#555]">
        uofthub — open-source home for U of T student projects
      </footer>
    </div>
  )
}

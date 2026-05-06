import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Home, Settings, Mic } from 'lucide-react'
import HomePage from './pages/Home'
import SettingsPage from './pages/Settings'
import MeetingDetailPage from './pages/MeetingDetail'

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof Home; label: string }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-primary-50 text-primary-700 font-medium'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </Link>
  )
}

export default function App() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary-700">
            <Mic size={28} />
            <h1 className="text-xl font-bold">MeetLog</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">本地大模型会议助手</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <NavItem to="/" icon={Home} label="会议记录" />
          <NavItem to="/settings" icon={Settings} label="系统设置" />
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-400 text-center">
            MeetLog Assistant v1.0.0
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/meeting/:id" element={<MeetingDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}

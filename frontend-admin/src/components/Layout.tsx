import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAppStore } from '../store/app-store';

export function Layout() {
  const { sidebarOpen, toggleSidebar, error, clearError } = useAppStore();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded hover:bg-gray-100"
              aria-label="Toggle sidebar"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">
              Cedar Terrace - Admin Portal
            </h1>
          </div>
          <div className="text-sm text-gray-600">Development Mode</div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-64 bg-white shadow-sm min-h-screen">
            <nav className="p-4 space-y-2">
              <NavLink to="/" icon="🏠">
                Dashboard
              </NavLink>
              <NavLink to="/positions" icon="🅿️">
                Parking Positions
              </NavLink>
              <NavLink to="/observations" icon="📷">
                Observations
              </NavLink>
              <NavLink to="/violations" icon="⚠️">
                Violations
              </NavLink>
              <NavLink to="/notices" icon="📄">
                Notices
              </NavLink>
            </nav>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 p-6">
          {/* Error banner */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-red-600">⚠️</span>
                <span className="text-red-800">{error}</span>
              </div>
              <button
                onClick={clearError}
                className="text-red-600 hover:text-red-800"
              >
                ✕
              </button>
            </div>
          )}

          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700 hover:text-gray-900"
    >
      <span>{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

import { ReactNode } from 'react';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Admin Portal</h1>
            </div>
            <nav className="flex space-x-8">
              <a href="/admin" className="text-gray-700 hover:text-gray-900">Dashboard</a>
              <a href="/admin/webinars" className="text-gray-700 hover:text-gray-900">Webinars</a>
              <a href="/admin/participants" className="text-gray-700 hover:text-gray-900">Participants</a>
              <a href="/admin/analytics" className="text-gray-700 hover:text-gray-900">Analytics</a>
            </nav>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

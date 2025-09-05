'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only redirect if we're not already on the login page
    if (!isLoading && !pathname.includes('/admin/login')) {
      if (!isAuthenticated) {
        router.push('/admin/login');
      } else if (user?.role !== 'admin') {
        // Redirect non-admin users to student dashboard
        router.push('/student');
      }
    }
  }, [isAuthenticated, isLoading, user, router, pathname]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Allow login page to render without layout
    if (pathname === '/admin/login') {
      return <>{children}</>;
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Admin Portal</h1>
            </div>
            <div className="flex items-center space-x-8">
              <nav className="flex space-x-8">
                <Link href="/admin" className="text-gray-700 hover:text-gray-900">Dashboard</Link>
                <Link href="/admin/webinars" className="text-gray-700 hover:text-gray-900">Webinars</Link>
                <Link href="/admin/participants" className="text-gray-700 hover:text-gray-900">Participants</Link>
                <Link href="/admin/analytics" className="text-gray-700 hover:text-gray-900">Analytics</Link>
              </nav>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700">Welcome, {user?.name}</span>
                <button
                  onClick={handleLogout}
                  className="text-gray-700 hover:text-gray-900 text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Webinar {
  id: string;
  title: string;
  hostId: string;
  hostName: string;
  maxParticipants: number;
  isLive: boolean;
  startTime?: Date;
  endTime?: Date;
  participants: string[];
  createdAt: Date;
}

interface DashboardStats {
  totalWebinars: number;
  activeParticipants: number;
  liveWebinars: number;
  totalViews: number;
}

export default function AdminDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalWebinars: 0,
    activeParticipants: 0,
    liveWebinars: 0,
    totalViews: 0
  });
  const [recentWebinars, setRecentWebinars] = useState<Webinar[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

const fetchDashboardData = async () => {
    try {
      // Fetch webinars
      const webinarsResponse = await fetch('/api/webinars', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (webinarsResponse.ok) {
        const webinars = await webinarsResponse.json();
        setRecentWebinars(webinars.slice(0, 5)); // Get first 5 webinars

        // Calculate stats
        const totalWebinars = webinars.length;
        const liveWebinars = webinars.filter((w: Webinar) => w.isLive).length;
        const activeParticipants = webinars.reduce((total: number, w: Webinar) =>
          total + (w.participants?.length || 0), 0
        );
        const totalViews = activeParticipants * 2; // Placeholder calculation

        setStats({
          totalWebinars,
          activeParticipants,
          liveWebinars,
          totalViews
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinWebinar = (webinarId: string) => {
    // Navigate to webinar room page
    window.location.href = `/student/webinars/${webinarId}`;
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-sm text-gray-600">Manage your webinars and participants</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow-lg rounded-xl hover:shadow-xl transition-all duration-300 border border-gray-100">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg font-bold">W</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Webinars</dt>
                  <dd className="text-2xl font-bold text-gray-900 mt-1">{stats.totalWebinars}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-lg rounded-xl hover:shadow-xl transition-all duration-300 border border-gray-100">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg font-bold">P</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active Participants</dt>
                  <dd className="text-2xl font-bold text-gray-900 mt-1">{stats.activeParticipants}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-lg rounded-xl hover:shadow-xl transition-all duration-300 border border-gray-100">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg font-bold">L</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Live Webinars</dt>
                  <dd className="text-2xl font-bold text-gray-900 mt-1">{stats.liveWebinars}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-lg rounded-xl hover:shadow-xl transition-all duration-300 border border-gray-100">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg font-bold">V</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Views</dt>
                  <dd className="text-2xl font-bold text-gray-900 mt-1">{stats.totalViews.toLocaleString()}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Recent Webinars</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Your latest webinar activities</p>
          </div>
          <ul className="divide-y divide-gray-200">
            {recentWebinars.length === 0 ? (
              <li>
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-600">No webinars found. Create your first webinar!</p>
                </div>
              </li>
            ) : (
              recentWebinars.map((webinar) => (
                <li key={webinar.id}>
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700">
                              {webinar.title.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{webinar.title}</div>
                          <div className="text-sm text-gray-500">
                            {(webinar.participants?.length || 0)} participants • Created {new Date(webinar.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          webinar.isLive
                            ? 'bg-green-100 text-green-800'
                            : webinar.startTime
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {webinar.isLive ? 'Live' : webinar.startTime ? 'Completed' : 'Scheduled'}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

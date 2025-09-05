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

interface StudentStats {
  enrolledWebinars: number;
  completedWebinars: number;
  availableRecordings: number;
}

export default function StudentDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState<StudentStats>({
    enrolledWebinars: 0,
    completedWebinars: 0,
    availableRecordings: 0
  });
  const [upcomingWebinars, setUpcomingWebinars] = useState<Webinar[]>([]);
  const [recentRecordings, setRecentRecordings] = useState<Webinar[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/webinars', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const webinars = await response.json();

        // Calculate stats
        const enrolledWebinars = webinars.length;
        const completedWebinars = webinars.filter((w: Webinar) => w.startTime && !w.isLive).length;
        const availableRecordings = completedWebinars; // Assuming all completed webinars have recordings

        setStats({
          enrolledWebinars,
          completedWebinars,
          availableRecordings
        });

        // Separate upcoming and recent recordings
        const liveWebinars = webinars.filter((w: Webinar) => w.isLive);
        const scheduledWebinars = webinars.filter((w: Webinar) => !w.isLive && !w.startTime);
        const completedWebinarsList = webinars.filter((w: Webinar) => w.startTime && !w.isLive);

        setUpcomingWebinars([...liveWebinars, ...scheduledWebinars].slice(0, 5));
        setRecentRecordings(completedWebinarsList.slice(0, 5));
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

  const handleWatchRecording = (webinarId: string) => {
    // Navigate to recording page or implement watch logic
    console.log('Watching recording:', webinarId);
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">My Dashboard</h2>
        <p className="mt-1 text-sm text-gray-600">Access your webinars and learning materials</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
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
                  <dt className="text-sm font-medium text-gray-500 truncate">Enrolled Webinars</dt>
                  <dd className="text-2xl font-bold text-gray-900 mt-1">{stats.enrolledWebinars}</dd>
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
                  <span className="text-white text-lg font-bold">C</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                  <dd className="text-2xl font-bold text-gray-900 mt-1">{stats.completedWebinars}</dd>
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
                  <span className="text-white text-lg font-bold">R</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Available Recordings</dt>
                  <dd className="text-2xl font-bold text-gray-900 mt-1">{stats.availableRecordings}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Upcoming Webinars</h3>
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {upcomingWebinars.length === 0 ? (
                <li>
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-gray-600">No upcoming webinars</p>
                  </div>
                </li>
              ) : (
                upcomingWebinars.map((webinar) => (
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
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {webinar.isLive ? 'Live' : 'Scheduled'}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2">
                        <button
                          onClick={() => handleJoinWebinar(webinar.id)}
                          disabled={!webinar.isLive}
                          className={`px-3 py-1 rounded text-sm ${
                            webinar.isLive
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-gray-600 hover:bg-gray-700 text-white'
                          }`}
                        >
                          {webinar.isLive ? 'Join Now' : 'Reminder Set'}
                        </button>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Recordings</h3>
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {recentRecordings.length === 0 ? (
                <li>
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-gray-600">No recordings available</p>
                  </div>
                </li>
              ) : (
                recentRecordings.map((webinar) => (
                  <li key={webinar.id}>
                    <div className="px-4 py-4 sm:px-6">
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
                            Completed {webinar.startTime ? new Date(webinar.startTime).toLocaleDateString() : 'Recently'} • {webinar.participants.length} participants
                          </div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <button
                          onClick={() => handleWatchRecording(webinar.id)}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                        >
                          Watch Recording
                        </button>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

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

export default function WebinarsPage() {
  const { token } = useAuth();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    maxParticipants: 100,
    scheduledDate: '',
    scheduledTime: '',
    duration: 60
  });

  useEffect(() => {
    fetchWebinars();
  }, []);

  const fetchWebinars = async () => {
    try {
      const response = await fetch('/api/webinars', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch webinars');
      }

      const data = await response.json();
      setWebinars(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError('');

    try {
      console.log('Token being sent:', token);
      console.log('Request data:', {
        title: formData.title,
        maxParticipants: formData.maxParticipants,
        settings: {
          description: formData.description,
          scheduledDate: formData.scheduledDate,
          scheduledTime: formData.scheduledTime,
          duration: formData.duration
        }
      });

      const response = await fetch('/api/webinars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formData.title,
          maxParticipants: formData.maxParticipants,
          settings: {
            description: formData.description,
            scheduledDate: formData.scheduledDate,
            scheduledTime: formData.scheduledTime,
            duration: formData.duration
          }
        }),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorData = await response.json();
        console.log('Error response:', errorData);
        throw new Error(errorData.error || 'Failed to create webinar');
      }

      const newWebinar = await response.json();
      console.log('Success response:', newWebinar);
      setWebinars(prev => [...prev, newWebinar]);
      setShowCreateForm(false);
      setFormData({
        title: '',
        description: '',
        maxParticipants: 100,
        scheduledDate: '',
        scheduledTime: '',
        duration: 60
      });
    } catch (err: any) {
      console.error('Error creating webinar:', err);
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartWebinar = async (webinarId: string) => {
    try {
      // This would be implemented with Socket.IO for real-time updates
      console.log('Starting webinar:', webinarId);
      // Update local state for now
      setWebinars(prev => prev.map(w =>
        w.id === webinarId ? { ...w, isLive: true, startTime: new Date() } : w
      ));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Webinars</h2>
          <p className="mt-1 text-sm text-gray-600">Schedule and manage your webinars</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Schedule Webinar
        </button>
      </div>

      {showCreateForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Schedule New Webinar</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                    Title
                  </label>
                  <input
                    type="text"
                    name="title"
                    id="title"
                    required
                    value={formData.title}
                    onChange={handleInputChange}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    name="description"
                    id="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleInputChange}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="scheduledDate" className="block text-sm font-medium text-gray-700">
                      Date
                    </label>
                    <input
                      type="date"
                      name="scheduledDate"
                      id="scheduledDate"
                      required
                      value={formData.scheduledDate}
                      onChange={handleInputChange}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="scheduledTime" className="block text-sm font-medium text-gray-700">
                      Time
                    </label>
                    <input
                      type="time"
                      name="scheduledTime"
                      id="scheduledTime"
                      required
                      value={formData.scheduledTime}
                      onChange={handleInputChange}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="maxParticipants" className="block text-sm font-medium text-gray-700">
                      Max Participants
                    </label>
                    <input
                      type="number"
                      name="maxParticipants"
                      id="maxParticipants"
                      min="1"
                      max="1000"
                      value={formData.maxParticipants}
                      onChange={handleInputChange}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      name="duration"
                      id="duration"
                      min="15"
                      max="480"
                      value={formData.duration}
                      onChange={handleInputChange}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Create Webinar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Loading webinars...</p>
          </div>
        </div>
      ) : webinars.length === 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-600">No webinars found. Create your first webinar!</p>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {webinars.map((webinar) => (
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
                          {(webinar.participants?.length ?? 0)} participants • Created {new Date(webinar.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        webinar.isLive
                          ? 'bg-green-100 text-green-800'
                          : webinar.startTime
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {webinar.isLive ? 'Live' : webinar.startTime ? 'Completed' : 'Scheduled'}
                      </span>
                      {!webinar.isLive && !webinar.startTime && (
                        <button
                          onClick={() => handleStartWebinar(webinar.id)}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium"
                        >
                          Start
                        </button>
                      )}
                      <button className="text-blue-600 hover:text-blue-900 text-sm font-medium">
                        Manage
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

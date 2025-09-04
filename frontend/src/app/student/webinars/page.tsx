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

export default function StudentWebinarsPage() {
  const { token } = useAuth();
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedWebinar, setSelectedWebinar] = useState<Webinar | null>(null);

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

  const handleJoinWebinar = (webinar: Webinar) => {
    if (webinar.isLive) {
      setSelectedWebinar(webinar);
      // TODO: Implement WebRTC connection
      console.log('Joining webinar:', webinar.id);
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading webinars...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Available Webinars</h2>
        <p className="mt-1 text-sm text-gray-600">Join live sessions or view scheduled webinars</p>
      </div>

      {webinars.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No webinars available at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {webinars.map((webinar) => (
            <div key={webinar.id} className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">{webinar.title}</h3>
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

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Host:</span>
                    <span className="text-gray-900">{webinar.hostName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Participants:</span>
                    <span className="text-gray-900">{webinar.participants.length}/{webinar.maxParticipants}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Created:</span>
                    <span className="text-gray-900">{new Date(webinar.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleJoinWebinar(webinar)}
                  disabled={!webinar.isLive}
                  className={`w-full px-4 py-2 text-sm font-medium rounded-md ${
                    webinar.isLive
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {webinar.isLive ? 'Join Live Session' : 'Not Available'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedWebinar && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">{selectedWebinar.title}</h3>
                <button
                  onClick={() => setSelectedWebinar(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <div className="bg-gray-900 rounded-lg h-96 flex items-center justify-center">
                    <div className="text-center text-white">
                      <div className="w-16 h-16 bg-gray-700 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm">WebRTC Video Stream</p>
                      <p className="text-xs text-gray-400 mt-1">Connecting...</p>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-center space-x-4">
                    <button className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-full">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                    <button className="bg-gray-600 hover:bg-gray-700 text-white p-3 rounded-full">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Participants ({selectedWebinar.participants.length})
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedWebinar.participants.length === 0 ? (
                        <p className="text-sm text-gray-500">No participants yet</p>
                      ) : (
                        selectedWebinar.participants.map((participant, i) => (
                          <div key={i} className="flex items-center space-x-2">
                            <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
                              <span className="text-xs font-medium text-gray-700">
                                {participant.substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-sm text-gray-700">{participant}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mt-4 bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Chat</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                      <div className="text-xs text-gray-500">Chat messages will appear here</div>
                    </div>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Type a message..."
                        className="flex-1 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm">
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

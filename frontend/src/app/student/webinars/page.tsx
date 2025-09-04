'use client';

import { useState } from 'react';

export default function StudentWebinarsPage() {
  const [selectedWebinar, setSelectedWebinar] = useState<string | null>(null);

  const webinars = [
    {
      id: '1',
      title: 'JavaScript Fundamentals',
      instructor: 'John Doe',
      date: 'Today',
      time: '2:00 PM',
      duration: '90 min',
      participants: 25,
      status: 'live',
      description: 'Learn the basics of JavaScript programming'
    },
    {
      id: '2',
      title: 'React Best Practices',
      instructor: 'Jane Smith',
      date: 'Tomorrow',
      time: '10:00 AM',
      duration: '60 min',
      participants: 0,
      status: 'scheduled',
      description: 'Advanced React patterns and best practices'
    },
    {
      id: '3',
      title: 'Python for Data Science',
      instructor: 'Mike Johnson',
      date: 'Dec 15',
      time: '3:00 PM',
      duration: '120 min',
      participants: 45,
      status: 'completed',
      description: 'Introduction to Python for data analysis'
    }
  ];

  const handleJoinWebinar = (webinarId: string) => {
    // TODO: Implement WebRTC connection and join webinar
    console.log('Joining webinar:', webinarId);
    setSelectedWebinar(webinarId);
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Available Webinars</h2>
        <p className="mt-1 text-sm text-gray-600">Join live sessions or view scheduled webinars</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {webinars.map((webinar) => (
          <div key={webinar.id} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">{webinar.title}</h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  webinar.status === 'live'
                    ? 'bg-green-100 text-green-800'
                    : webinar.status === 'scheduled'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {webinar.status === 'live' ? 'Live' : webinar.status === 'scheduled' ? 'Scheduled' : 'Completed'}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-4">{webinar.description}</p>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Instructor:</span>
                  <span className="text-gray-900">{webinar.instructor}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Date:</span>
                  <span className="text-gray-900">{webinar.date}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Time:</span>
                  <span className="text-gray-900">{webinar.time}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Duration:</span>
                  <span className="text-gray-900">{webinar.duration}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Participants:</span>
                  <span className="text-gray-900">{webinar.participants}</span>
                </div>
              </div>

              <button
                onClick={() => handleJoinWebinar(webinar.id)}
                disabled={webinar.status === 'completed'}
                className={`w-full px-4 py-2 text-sm font-medium rounded-md ${
                  webinar.status === 'live'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : webinar.status === 'scheduled'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {webinar.status === 'live' ? 'Join Live Session' :
                 webinar.status === 'scheduled' ? 'Set Reminder' : 'Recording Available'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedWebinar && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Webinar Session</h3>
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
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Participants (25)</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {Array.from({ length: 8 }, (_, i) => (
                        <div key={i} className="flex items-center space-x-2">
                          <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-gray-700">
                              {String.fromCharCode(65 + i)}
                            </span>
                          </div>
                          <span className="text-sm text-gray-700">Participant {i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Chat</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                      <div className="text-xs">
                        <span className="font-medium text-gray-900">John:</span>
                        <span className="text-gray-700 ml-1">Great session!</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-medium text-gray-900">Jane:</span>
                        <span className="text-gray-700 ml-1">Thanks for the explanation</span>
                      </div>
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

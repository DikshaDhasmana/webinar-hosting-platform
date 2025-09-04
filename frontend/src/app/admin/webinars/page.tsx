'use client';

import { useState } from 'react';

export default function WebinarsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    maxParticipants: 100,
    scheduledDate: '',
    scheduledTime: '',
    duration: 60
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement webinar creation API call
    console.log('Creating webinar:', formData);
    setShowCreateForm(false);
    setFormData({
      title: '',
      description: '',
      maxParticipants: 100,
      scheduledDate: '',
      scheduledTime: '',
      duration: 60
    });
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

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          <li>
            <div className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-10 w-10">
                    <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-700">JS</span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">JavaScript Fundamentals</div>
                    <div className="text-sm text-gray-500">Today at 2:00 PM • 25 participants</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Live
                  </span>
                  <button className="text-blue-600 hover:text-blue-900 text-sm font-medium">
                    Manage
                  </button>
                </div>
              </div>
            </div>
          </li>

          <li>
            <div className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-10 w-10">
                    <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-700">RE</span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">React Best Practices</div>
                    <div className="text-sm text-gray-500">Tomorrow at 10:00 AM • 0 participants</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    Scheduled
                  </span>
                  <button className="text-blue-600 hover:text-blue-900 text-sm font-medium">
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </li>

          <li>
            <div className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-10 w-10">
                    <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-700">PY</span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">Python for Data Science</div>
                    <div className="text-sm text-gray-500">Last week • 45 participants</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    Completed
                  </span>
                  <button className="text-blue-600 hover:text-blue-900 text-sm font-medium">
                    View Recording
                  </button>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

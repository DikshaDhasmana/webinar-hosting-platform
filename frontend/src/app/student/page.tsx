export default function StudentDashboard() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">My Dashboard</h2>
        <p className="mt-1 text-sm text-gray-600">Access your webinars and learning materials</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">W</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Enrolled Webinars</dt>
                  <dd className="text-lg font-medium text-gray-900">8</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">C</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                  <dd className="text-lg font-medium text-gray-900">5</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">R</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Available Recordings</dt>
                  <dd className="text-lg font-medium text-gray-900">12</dd>
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
                        <div className="text-sm text-gray-500">Today at 2:00 PM</div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Live
                      </span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm">
                      Join Now
                    </button>
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
                        <div className="text-sm text-gray-500">Tomorrow at 10:00 AM</div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Scheduled
                      </span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm">
                      Reminder Set
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Recordings</h3>
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              <li>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-700">PY</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">Python for Data Science</div>
                      <div className="text-sm text-gray-500">Completed 2 days ago • 2h 15m</div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <button className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm">
                      Watch Recording
                    </button>
                  </div>
                </div>
              </li>

              <li>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-700">DB</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">Database Design Principles</div>
                      <div className="text-sm text-gray-500">Completed 1 week ago • 1h 45m</div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <button className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm">
                      Watch Recording
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

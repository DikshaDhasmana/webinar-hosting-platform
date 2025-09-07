'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface Webinar {
  _id: string
  title: string
  description: string
  scheduledDate: string
  duration: number
  maxParticipants: number
  status: 'scheduled' | 'live' | 'ended'
  isPublic: boolean
  host: {
    _id: string
    username: string
    firstName: string
    lastName: string
  }
  participants: any[]
  settings: {
    allowChat: boolean
    allowReactions: boolean
    allowScreenShare: boolean
    allowRecording: boolean
    waitingRoom: boolean
    requireApproval: boolean
  }
}

interface ParticipantPermissions {
  canPresent: boolean
  canShareScreen: boolean
  canChat: boolean
  canReact: boolean
}

export default function WebinarRoom() {
  const params = useParams()
  const webinarId = params?.id
  const router = useRouter()

  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [participantRole, setParticipantRole] = useState<string>('')
  const [permissions, setPermissions] = useState<ParticipantPermissions | null>(null)
  const [user, setUser] = useState<any>(null)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      router.push('/login')
      return
    }

    const parsedUser = JSON.parse(userData)
    setUser(parsedUser)

    if (webinarId) {
      fetchWebinarDetails(webinarId, token)
    }
  }, [webinarId])

  const fetchWebinarDetails = async (id: string, token: string) => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`http://localhost:5000/api/webinars/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (data.success) {
        setWebinar(data.data)
        // Determine participant role and permissions
        const isHost = data.data.host._id === JSON.parse(localStorage.getItem('user') || '{}').id
        setParticipantRole(isHost ? 'host' : 'attendee')

        setPermissions({
          canPresent: isHost,
          canShareScreen: isHost || data.data.settings.allowScreenShare,
          canChat: data.data.settings.allowChat,
          canReact: data.data.settings.allowReactions
        })
      } else {
        setError(data.message || 'Failed to load webinar details')
      }
    } catch (error) {
      setError('Failed to load webinar details. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const startWebinar = async () => {
    if (!webinar) return
    setJoining(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:5000/api/webinars/${webinar._id}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (data.success) {
        setWebinar(data.data)
      } else {
        setError(data.message || 'Failed to start webinar')
      }
    } catch (error) {
      setError('Failed to start webinar. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  const joinWebinar = async () => {
    if (!webinar) return
    setJoining(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:5000/api/webinars/${webinar._id}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (data.success) {
        // For now, just simulate joining by showing a message or redirecting
        alert('Joined webinar room. Host controls and features would be here.')
      } else {
        setError(data.message || 'Failed to join webinar')
      }
    } catch (error) {
      setError('Failed to join webinar. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <Link href="/webinars" className="text-blue-600 hover:text-blue-700">
          Back to Webinars
        </Link>
      </div>
    )
  }

  if (!webinar) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700 dark:text-gray-300">Webinar not found.</p>
      </div>
    )
  }

  const isHost = participantRole === 'host'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">{webinar.title}</h1>
        <p className="mb-4 text-gray-700 dark:text-gray-300">{webinar.description}</p>
        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
          Scheduled: {new Date(webinar.scheduledDate).toLocaleString()}
        </p>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Duration: {webinar.duration} minutes
        </p>

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Settings</h2>
          <ul className="list-disc list-inside text-gray-700 dark:text-gray-300">
            <li>Allow Chat: {webinar.settings.allowChat ? 'Yes' : 'No'}</li>
            <li>Allow Reactions: {webinar.settings.allowReactions ? 'Yes' : 'No'}</li>
            <li>Allow Screen Share: {webinar.settings.allowScreenShare ? 'Yes' : 'No'}</li>
            <li>Allow Recording: {webinar.settings.allowRecording ? 'Yes' : 'No'}</li>
            <li>Waiting Room: {webinar.settings.waitingRoom ? 'Enabled' : 'Disabled'}</li>
            <li>Require Approval: {webinar.settings.requireApproval ? 'Yes' : 'No'}</li>
          </ul>
        </div>

        <div className="flex space-x-4">
          {isHost && webinar.status === 'scheduled' && (
            <button
              onClick={startWebinar}
              disabled={joining}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
            >
              {joining ? 'Starting...' : 'Start Webinar'}
            </button>
          )}
          {(isHost || webinar.status === 'live') && (
            <Link
              href={`/webinars/${webinarId}/room`}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md inline-block text-center"
            >
              Enter Webinar Room
            </Link>
          )}
          <Link
            href="/webinars"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Back to Webinars
          </Link>
        </div>
      </div>
    </div>
  )
}

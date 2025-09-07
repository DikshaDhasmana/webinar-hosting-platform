'use client'

import { useEffect, useState, useRef } from 'react'
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

interface ChatMessage {
  id: string
  user: string
  message: string
  timestamp: Date
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
  const [joined, setJoined] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isAudioOn, setIsAudioOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [participants, setParticipants] = useState<any[]>([])

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const screenVideoRef = useRef<HTMLVideoElement>(null)

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

  const joinWebinar = async () => {
    if (!webinar) return
    setLoading(true)
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
        setJoined(true)
        setWebinar(data.data.webinar)
        setPermissions(data.data.participant.permissions)
        setParticipantRole(data.data.participant.role)

        // Initialize media devices
        await initializeMedia()
      } else {
        setError(data.message || 'Failed to join webinar')
      }
    } catch (error) {
      setError('Failed to join webinar. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const initializeMedia = async () => {
    try {
      console.log('Initializing media devices...')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      })

      console.log('Media stream obtained:', stream)
      console.log('Video tracks:', stream.getVideoTracks())
      console.log('Audio tracks:', stream.getAudioTracks())

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        console.log('Stream assigned to video element')

        // Ensure tracks are enabled
        stream.getVideoTracks().forEach(track => {
          track.enabled = true
          console.log('Video track enabled:', track.label)
        })

        stream.getAudioTracks().forEach(track => {
          track.enabled = true
          console.log('Audio track enabled:', track.label)
        })
      }

      setIsVideoOn(true)
      setIsAudioOn(true)
      console.log('Media initialization complete')
    } catch (error) {
      console.error('Error accessing media devices:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`Failed to access camera and microphone: ${errorMessage}`)
    }
  }

  const toggleVideo = async () => {
    if (!localVideoRef.current?.srcObject) return

    const stream = localVideoRef.current.srcObject as MediaStream
    const videoTrack = stream.getVideoTracks()[0]

    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setIsVideoOn(videoTrack.enabled)
    }
  }

  const toggleAudio = async () => {
    if (!localVideoRef.current?.srcObject) return

    const stream = localVideoRef.current.srcObject as MediaStream
    const audioTrack = stream.getAudioTracks()[0]

    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setIsAudioOn(audioTrack.enabled)
    }
  }

  const toggleScreenShare = async () => {
    if (!permissions?.canShareScreen) return

    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (screenVideoRef.current?.srcObject) {
          const stream = screenVideoRef.current.srcObject as MediaStream
          stream.getTracks().forEach(track => track.stop())
          screenVideoRef.current.srcObject = null
        }
        setIsScreenSharing(false)
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        })

        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = screenStream
        }
        setIsScreenSharing(true)
      }
    } catch (error) {
      console.error('Error sharing screen:', error)
      setError('Failed to share screen')
    }
  }

  const toggleRecording = () => {
    if (!permissions?.canPresent) return
    setIsRecording(!isRecording)
    // TODO: Implement actual recording functionality
  }

  const sendMessage = () => {
    if (!newMessage.trim() || !permissions?.canChat) return

    const message: ChatMessage = {
      id: Date.now().toString(),
      user: user?.firstName + ' ' + user?.lastName,
      message: newMessage.trim(),
      timestamp: new Date()
    }

    setChatMessages(prev => [...prev, message])
    setNewMessage('')
  }

  const sendReaction = (reaction: string) => {
    if (!permissions?.canReact) return
    // TODO: Implement reaction functionality
    console.log('Sending reaction:', reaction)
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
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 p-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">{webinar.title}</h1>
          <p className="text-sm text-gray-300">
            Host: {webinar.host.firstName} {webinar.host.lastName} • {participants.length}/{webinar.maxParticipants} participants
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <span className={`px-3 py-1 rounded-full text-sm ${
            webinar.status === 'live' ? 'bg-green-600' : 'bg-yellow-600'
          }`}>
            {webinar.status}
          </span>
          <Link
            href={`/webinars/${webinarId}`}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm"
          >
            Exit Room
          </Link>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Main Video Area */}
        <div className="flex-1 p-4">
          <div className="bg-gray-800 rounded-lg h-full relative">
            {joined ? (
              <div className="h-full flex flex-col">
                {/* Video Grid */}
                <div className="flex-1 grid grid-cols-2 gap-4 p-4">
                  {/* Local Video */}
                  <div className="bg-gray-700 rounded-lg overflow-hidden">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 text-white text-sm">
                      You {isHost && '(Host)'}
                    </div>
                  </div>

                  {/* Remote Video or Screen Share */}
                  <div className="bg-gray-700 rounded-lg overflow-hidden">
                    {isScreenSharing ? (
                      <video
                        ref={screenVideoRef}
                        autoPlay
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <div className="text-center">
                          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <p>Waiting for participants...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="p-4 bg-gray-800 border-t border-gray-700">
                  <div className="flex justify-center space-x-4">
                    {/* Video Toggle */}
                    <button
                      onClick={toggleVideo}
                      className={`p-3 rounded-full ${
                        isVideoOn ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-600 hover:bg-red-500'
                      }`}
                      title={isVideoOn ? 'Turn off video' : 'Turn on video'}
                    >
                      {isVideoOn ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      )}
                    </button>

                    {/* Audio Toggle */}
                    <button
                      onClick={toggleAudio}
                      className={`p-3 rounded-full ${
                        isAudioOn ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-600 hover:bg-red-500'
                      }`}
                      title={isAudioOn ? 'Mute microphone' : 'Unmute microphone'}
                    >
                      {isAudioOn ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        </svg>
                      )}
                    </button>

                    {/* Screen Share */}
                    {permissions?.canShareScreen && (
                      <button
                        onClick={toggleScreenShare}
                        className={`p-3 rounded-full ${
                          isScreenSharing ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-600 hover:bg-gray-500'
                        }`}
                        title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}

                    {/* Recording */}
                    {permissions?.canPresent && webinar.settings.allowRecording && (
                      <button
                        onClick={toggleRecording}
                        className={`p-3 rounded-full ${
                          isRecording ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 hover:bg-gray-500'
                        }`}
                        title={isRecording ? 'Stop recording' : 'Start recording'}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                        </svg>
                      </button>
                    )}

                    {/* Reactions */}
                    {permissions?.canReact && (
                      <div className="relative">
                        <button
                          className="p-3 rounded-full bg-gray-600 hover:bg-gray-500"
                          title="Send reaction"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 hidden group-hover:block">
                          <div className="bg-gray-800 rounded-lg p-2 flex space-x-2">
                            {['👍', '👎', '❤️', '😂', '😮'].map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => sendReaction(emoji)}
                                className="text-2xl hover:scale-125 transition-transform"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-4">Ready to join the webinar?</h2>
                  <p className="text-gray-400 mb-6">
                    Make sure your camera and microphone are working properly.
                  </p>
                  <button
                    onClick={joinWebinar}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-medium"
                  >
                    Join Webinar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
          {/* Participants */}
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Participants ({participants.length})</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {participants.map((participant, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {participant.name?.charAt(0) || '?'}
                    </span>
                  </div>
                  <span className="text-sm">{participant.name || 'Anonymous'}</span>
                  {participant.isHost && (
                    <span className="text-xs bg-blue-600 px-2 py-1 rounded">Host</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          {permissions?.canChat && (
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold">Chat</h3>
              </div>

              {/* Messages */}
              <div className="flex-1 p-4 overflow-y-auto">
                {chatMessages.length === 0 ? (
                  <p className="text-gray-400 text-center">No messages yet</p>
                ) : (
                  <div className="space-y-3">
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className="bg-gray-700 rounded-lg p-3">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-blue-400">{msg.user}</span>
                          <span className="text-xs text-gray-400">
                            {msg.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-gray-700">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={sendMessage}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

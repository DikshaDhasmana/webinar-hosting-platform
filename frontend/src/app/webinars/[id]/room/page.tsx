'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { socketService, Participant, ChatMessage } from '@/services/socketService'
import { useWebRTC } from '@/hooks/useWebRTC'

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
  const [joined, setJoined] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isAudioOn, setIsAudioOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [videoError, setVideoError] = useState('')

  // Log participants whenever the list changes
  useEffect(() => {
    console.log('=== PARTICIPANTS LIST UPDATED ===')
    const participantCount = Array.isArray(participants) ? participants.length : 0
    console.log('Total participants:', participantCount)
    if (Array.isArray(participants) && participants.length > 0) {
      participants.forEach((participant, index) => {
        if (participant) {
          console.log(`${index + 1}. ${participant?.firstName || 'Unknown'} ${participant?.lastName || 'User'} (${participant?.username || 'N/A'}) - Role: ${participant?.role || 'N/A'}, UserID: ${participant?.userId || 'N/A'}`)
        }
      })
    }
    console.log('================================')
  }, [participants])
  const [isVideoLoading, setIsVideoLoading] = useState(false)
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false)
  const [isScreenVideoReady, setIsScreenVideoReady] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const screenVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // WebRTC state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const { peers, initializeWebRTC, handleParticipantJoined, handleParticipantLeft, updateLocalStream, cleanup } = useWebRTC(webinarId as string, user?.id || '', localStream)

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

  // Cleanup when component unmounts or user leaves
  useEffect(() => {
    return () => {
      console.log('=== LEAVING WEBINAR ROOM ===')
      console.log('Room ID:', webinarId)
      console.log('User:', user?.firstName || 'Unknown', user?.lastName || 'User', '(UserID:', user?.id || 'N/A' + ')')
      console.log('================================')
    }
  }, [webinarId, user])

  // Initialize media when video element is mounted and user has joined
  useEffect(() => {
    if (joined && localVideoRef.current && !localStream) {
      console.log('Video element mounted and user joined, initializing media...')
      initializeMedia()
    }
  }, [joined, localVideoRef.current, localStream])

  // Initialize screen video element when user has joined
  useEffect(() => {
    if (joined && screenVideoRef.current && !isScreenVideoReady) {
      console.log('Screen video element mounted and user joined, marking as ready...')
      setIsScreenVideoReady(true)
    }
  }, [joined, screenVideoRef.current, isScreenVideoReady])

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

    // Define setupSocketListeners function here
      const setupSocketListeners = () => {
        // Handle initial room join with participants list
        socketService.onRoomJoined((data) => {
          console.log('=== ROOM JOINED EVENT RECEIVED ===')
          console.log('Room ID:', data.roomId)
          console.log('Participants data:', data.participants)
          console.log('Participants count:', data.participants?.length || 0)
          console.log('Participants type:', Array.isArray(data.participants) ? 'Array' : typeof data.participants)

          if (data.participants && Array.isArray(data.participants)) {
            // Normalize all participants to have userId property
            const normalizedParticipants = data.participants.map(participant => ({
              ...participant,
              userId: participant.id || participant.userId
            }))
            console.log('Normalized participants:', normalizedParticipants)
            setParticipants(normalizedParticipants)
            console.log('Set initial participants:', normalizedParticipants.length)
          } else {
            console.log('No participants array received, setting empty array')
            setParticipants([])
          }
        })

        socketService.onParticipantJoined((data) => {
          console.log('=== PARTICIPANT JOINED ===')
          if (data?.user) {
            console.log('New participant:', data.user.firstName, data.user.lastName, '(UserID:', data.user.userId + ')')
            // Normalize participant object to have userId property
            const normalizedParticipant = {
              ...data.user,
              userId: data.user.id || data.user.userId
            }
            setParticipants(prev => {
              // Check if participant already exists to avoid duplicates
              const exists = prev.some(p => p?.userId === normalizedParticipant.userId)
              if (exists) {
                console.log('Participant already exists, skipping duplicate')
                return prev
              }
              return Array.isArray(prev) ? [...prev, normalizedParticipant] : [normalizedParticipant]
            })
          } else {
            console.error('Invalid participant joined data:', data)
          }
        })

        socketService.onParticipantLeft((data) => {
          console.log('=== PARTICIPANT LEFT ===')
          if (data?.userId) {
            console.log('Participant left:', data.userId)
            setParticipants(prev => Array.isArray(prev) ? prev.filter(p => p?.userId !== data.userId) : [])
          } else {
            console.error('Invalid participant left data:', data)
          }
        })

      socketService.onNewMessage((message) => {
        setChatMessages(prev => [...prev, message])
      })

      // Add other socket event listeners as needed
    }

    try {
      const token = localStorage.getItem('token')
      if (!token) throw new Error('No token found')

      // Connect to socket first
      await socketService.connect(token)

      // Set up socket event listeners BEFORE joining room
      setupSocketListeners()

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
        setParticipants([]) // Participants are managed via socket events

        console.log('=== JOINED WEBINAR ROOM ===')
        console.log('Room ID:', webinarId)
        console.log('Initial participants:', data.data.webinar.participantCount || 0)

        // Join socket room AFTER listeners are set up
        if (webinarId) {
          socketService.joinRoom({ roomId: webinarId })
        }
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
      setIsVideoLoading(true)
      setVideoError('')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      })

      console.log('Media stream obtained:', stream)
      console.log('Video tracks:', stream.getVideoTracks())
      console.log('Audio tracks:', stream.getAudioTracks())

      // Set local stream for WebRTC first
      setLocalStream(stream)
      localStreamRef.current = stream

      // Assign stream to video element with proper error handling
      if (localVideoRef.current) {
        console.log('Assigning stream to video element...')
        localVideoRef.current.srcObject = stream
        console.log('Stream assigned, srcObject:', localVideoRef.current.srcObject)

        // Ensure video element is properly configured
        localVideoRef.current.muted = true // Required for autoplay
        localVideoRef.current.playsInline = true // Required for mobile

        // Add event listeners for better debugging
        localVideoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded, dimensions:', localVideoRef.current?.videoWidth, 'x', localVideoRef.current?.videoHeight)
          setIsVideoLoading(false)
        }

        localVideoRef.current.onloadeddata = () => {
          console.log('Video data loaded, readyState:', localVideoRef.current?.readyState)
        }

        localVideoRef.current.oncanplay = () => {
          console.log('Video can play, readyState:', localVideoRef.current?.readyState)
        }

        localVideoRef.current.onerror = (e) => {
          console.error('Video element error:', e)
          setVideoError('Video playback error')
          setIsVideoLoading(false)
        }

        // Wait for video element to be ready with timeout
        await new Promise((resolve) => {
          if (localVideoRef.current) {
            const onReady = () => {
              console.log('Video ready to play, final readyState:', localVideoRef.current?.readyState)
              resolve(void 0)
            }

            if (localVideoRef.current.readyState >= 2) {
              onReady()
            } else {
              localVideoRef.current.addEventListener('canplay', onReady, { once: true })
              // Add timeout to prevent hanging
              setTimeout(() => {
                console.log('Video ready timeout, proceeding anyway')
                resolve(void 0)
              }, 2000)
            }
          }
        })

        // Attempt to play the video
        try {
          console.log('Attempting to play video...')
          await localVideoRef.current.play()
          console.log('Local video playing successfully')
          setNeedsUserInteraction(false)
        } catch (playError) {
          console.error('Local video play failed:', playError)
          setNeedsUserInteraction(true)
          setVideoError('Click "Start Video" to begin')
        }

        // Ensure tracks are enabled
        stream.getVideoTracks().forEach(track => {
          track.enabled = true
          console.log('Video track enabled:', track.label, 'readyState:', track.readyState)
        })

        stream.getAudioTracks().forEach(track => {
          track.enabled = true
          console.log('Audio track enabled:', track.label, 'readyState:', track.readyState)
        })
      } else {
        console.error('Local video ref is null!')
      }

      setIsVideoOn(true)
      setIsAudioOn(true)
      console.log('Media initialization complete')
    } catch (error) {
      console.error('Error accessing media devices:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setVideoError(`Failed to access camera and microphone: ${errorMessage}`)
      setIsVideoLoading(false)
    }
  }

  const startVideoPlayback = async () => {
    if (!localVideoRef.current) return

    try {
      setIsVideoLoading(true)
      setVideoError('')
      await localVideoRef.current.play()
      setNeedsUserInteraction(false)
      console.log('Video started manually')
    } catch (error) {
      console.error('Manual video play failed:', error)
      setVideoError('Failed to start video playback')
    } finally {
      setIsVideoLoading(false)
    }
  }

  const toggleVideo = async () => {
    if (!localStreamRef.current) return

    const stream = localStreamRef.current
    const videoTrack = stream.getVideoTracks()[0]

    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setIsVideoOn(videoTrack.enabled)

      // Update WebRTC stream
      if (updateLocalStream) {
        updateLocalStream(stream)
      }

      // Notify other participants via socket
      socketService.toggleVideo({ enabled: videoTrack.enabled })
    }
  }

  const toggleAudio = async () => {
    if (!localStreamRef.current) return

    const stream = localStreamRef.current
    const audioTrack = stream.getAudioTracks()[0]

    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setIsAudioOn(audioTrack.enabled)

      // Update WebRTC stream
      if (updateLocalStream) {
        updateLocalStream(stream)
      }

      // Notify other participants via socket
      socketService.toggleAudio({ enabled: audioTrack.enabled })
    }
  }

  const toggleScreenShare = async () => {
    if (!permissions?.canShareScreen) return

    // Check if screen video element is ready
    if (!isScreenVideoReady) {
      console.error('Screen video element not ready yet')
      setError('Screen sharing is not ready. Please wait a moment and try again.')
      return
    }

    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (screenVideoRef.current?.srcObject) {
          const stream = screenVideoRef.current.srcObject as MediaStream
          stream.getTracks().forEach(track => {
            track.stop()
            console.log('Screen sharing track stopped:', track.label)
          })
          screenVideoRef.current.srcObject = null
        }

        // Switch back to local video in the second video slot
        if (localStreamRef.current && screenVideoRef.current) {
          screenVideoRef.current.srcObject = localStreamRef.current
          await screenVideoRef.current.play().catch(e => console.error('Local video play failed:', e))
        }

        setIsScreenSharing(false)

        // Notify other participants
        socketService.stopScreenShare()
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          }
        })

        // Handle when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
          console.log('Screen sharing ended by user')
          toggleScreenShare()
        })

        // Wait for screen video element to be ready
        if (screenVideoRef.current) {
          console.log('Assigning screen stream to video element...')
          screenVideoRef.current.srcObject = screenStream
          console.log('Screen stream assigned, srcObject:', screenVideoRef.current.srcObject)

          // Ensure video element is properly configured
          screenVideoRef.current.muted = true // Required for autoplay
          screenVideoRef.current.playsInline = true // Required for mobile

          // Add event listeners for better debugging
          screenVideoRef.current.onloadedmetadata = () => {
            console.log('Screen video metadata loaded, dimensions:', screenVideoRef.current?.videoWidth, 'x', screenVideoRef.current?.videoHeight)
          }

          screenVideoRef.current.onloadeddata = () => {
            console.log('Screen video data loaded, readyState:', screenVideoRef.current?.readyState)
          }

          screenVideoRef.current.oncanplay = () => {
            console.log('Screen video can play, readyState:', screenVideoRef.current?.readyState)
          }

          screenVideoRef.current.onerror = (e) => {
            console.error('Screen video element error:', e)
            setError('Screen share video playback error')
          }

          // Wait for video element to be ready with timeout
          await new Promise((resolve) => {
            if (screenVideoRef.current) {
              const onReady = () => {
                console.log('Screen video ready to play, final readyState:', screenVideoRef.current?.readyState)
                resolve(void 0)
              }

              if (screenVideoRef.current.readyState >= 2) {
                onReady()
              } else {
                screenVideoRef.current.addEventListener('canplay', onReady, { once: true })
                // Add timeout to prevent hanging
                setTimeout(() => {
                  console.log('Screen video ready timeout, proceeding anyway')
                  resolve(void 0)
                }, 2000)
              }
            }
          })

          // Attempt to play the screen video
          try {
            console.log('Attempting to play screen video...')
            await screenVideoRef.current.play()
            console.log('Screen video playing successfully')
          } catch (playError) {
            console.error('Screen video play failed:', playError)
            setError('Failed to start screen sharing playback')
          }
        } else {
          console.error('Screen video ref is null!')
          setError('Screen sharing video element not ready')
        }

        setIsScreenSharing(true)

        // Notify other participants
        socketService.startScreenShare()
      }
    } catch (error) {
      console.error('Error sharing screen:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`Failed to share screen: ${errorMessage}`)
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
      userId: user?.id || '',
      username: user?.username || '',
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      message: newMessage.trim(),
      timestamp: new Date().toISOString(),
      role: participantRole
    }

    setChatMessages(prev => [...prev, message])
    setNewMessage('')
  }

  const sendReaction = (reaction: string) => {
    if (!permissions?.canReact) return
    // TODO: Implement reaction functionality
    console.log('Sending reaction:', reaction)
  }

  const debugVideo = () => {
    console.log('=== VIDEO DEBUG INFO ===')
    console.log('Local video ref:', localVideoRef.current)
    console.log('Screen video ref:', screenVideoRef.current)
    console.log('Local stream:', localStreamRef.current)
    console.log('Local stream tracks:', localStreamRef.current?.getTracks())
    console.log('Is video on:', isVideoOn)
    console.log('Is screen sharing:', isScreenSharing)
    console.log('Video error:', videoError)
    console.log('Needs user interaction:', needsUserInteraction)

    if (localVideoRef.current) {
      console.log('Local video element properties:')
      console.log('- srcObject:', localVideoRef.current.srcObject)
      console.log('- readyState:', localVideoRef.current.readyState)
      console.log('- videoWidth:', localVideoRef.current.videoWidth)
      console.log('- videoHeight:', localVideoRef.current.videoHeight)
      console.log('- muted:', localVideoRef.current.muted)
      console.log('- paused:', localVideoRef.current.paused)
    }

    if (screenVideoRef.current) {
      console.log('Screen video element properties:')
      console.log('- srcObject:', screenVideoRef.current.srcObject)
      console.log('- readyState:', screenVideoRef.current.readyState)
      console.log('- videoWidth:', screenVideoRef.current.videoWidth)
      console.log('- videoHeight:', screenVideoRef.current.videoHeight)
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
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 p-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">{webinar.title}</h1>
          <p className="text-sm text-gray-300">
            Host: {webinar.host?.firstName} {webinar.host?.lastName} • {Array.isArray(participants) ? participants.length : 0}/{webinar.maxParticipants} participants
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
                  <div className="bg-gray-700 rounded-lg overflow-hidden relative" style={{ minHeight: '200px', width: '100%', position: 'relative' }}>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      style={{
                        minHeight: '200px',
                        width: '100%',
                        height: '100%',
                        backgroundColor: '#374151',
                        display: 'block'
                      }}
                      onLoadedData={() => {
                        console.log('Local video loaded successfully')
                        setVideoError('')
                      }}
                      onError={(e) => {
                        console.error('Local video error:', e)
                        setVideoError('Video element error')
                      }}
                      onCanPlay={() => console.log('Local video can play')}
                    />
                    {!isVideoOn && !isVideoLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
                        <div className="text-center text-gray-400">
                          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <p>Camera off</p>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
                      You {isHost && '(Host)'}
                    </div>
                  </div>

                  {/* Remote Video or Screen Share */}
                  <div className="bg-gray-700 rounded-lg overflow-hidden relative" style={{ minHeight: '200px', width: '100%', position: 'relative' }}>
                    {/* Always render screen video element for readiness check */}
                    <video
                      ref={screenVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-contain"
                      style={{
                        minHeight: '200px',
                        width: '100%',
                        height: '100%',
                        backgroundColor: '#374151',
                        display: isScreenSharing ? 'block' : 'none'
                      }}
                      onLoadedData={() => {
                        console.log('Screen share video loaded successfully')
                        setVideoError('')
                      }}
                      onError={(e) => {
                        console.error('Screen share video error:', e)
                        setVideoError('Screen share error')
                      }}
                      onCanPlay={() => console.log('Screen share video can play')}
                    />

                    {/* Screen share label - only show when sharing */}
                    {isScreenSharing && (
                      <div className="absolute bottom-2 left-2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
                        Screen Share
                      </div>
                    )}

                    {/* Placeholder when not screen sharing */}
                    {!isScreenSharing && (
                      <div className="w-full h-full flex items-center justify-center text-gray-400" style={{ minHeight: '200px' }}>
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
                {needsUserInteraction ? (
                  <button
                    onClick={startVideoPlayback}
                    className="p-3 rounded-full bg-blue-600 hover:bg-blue-500"
                    title="Start Video"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </button>
                ) : (
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
                )}
                {videoError && (
                  <div className="text-red-500 text-sm mt-1 text-center">
                    {videoError}
                  </div>
                )}

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

                    {/* Debug Button */}
                    <button
                      onClick={debugVideo}
                      className="p-3 rounded-full bg-purple-600 hover:bg-purple-500"
                      title="Debug video (check console)"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
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
            <h3 className="text-lg font-semibold mb-3">Participants ({Array.isArray(participants) ? participants.length : 0})</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {Array.isArray(participants) && participants.length > 0 ? (
                participants.map((participant, index) => (
                  <div key={participant?.userId || index} className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium">
                        {participant?.firstName?.charAt(0) || '?'}
                      </span>
                    </div>
                    <span className="text-sm">{participant?.firstName || 'Unknown'} {participant?.lastName || 'User'}</span>
                    {participant?.role === 'host' && (
                      <span className="text-xs bg-blue-600 px-2 py-1 rounded">Host</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm">No participants yet</p>
              )}
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
                          <span className="text-sm font-medium text-blue-400">
                            {msg.firstName} {msg.lastName}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(msg.timestamp).toLocaleTimeString()}
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

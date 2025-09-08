import { useEffect, useRef, useState, useCallback } from 'react'
import Peer from 'simple-peer'
import { socketService, Participant } from '../services/socketService'

export interface PeerConnection {
  peerId: string
  peer: Peer.Instance
  stream?: MediaStream
  userId: string
  username: string
}

export const useWebRTC = (roomId: string, userId: string, localStream: MediaStream | null) => {
  const [peers, setPeers] = useState<PeerConnection[]>([])
  const [isInitiator, setIsInitiator] = useState(false)
  const peersRef = useRef<PeerConnection[]>([])

  // Create peer connection
  const createPeer = useCallback((targetUserId: string, targetUsername: string, targetSocketId: string, stream: MediaStream) => {
    const peer = new Peer({
      initiator: isInitiator,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    })

    peer.on('signal', (signal) => {
      if (signal.type === 'offer') {
        socketService.sendOffer({ targetUserId, offer: signal })
      } else if (signal.type === 'answer') {
        socketService.sendAnswer({ targetUserId, answer: signal })
      }
    })

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream from:', targetUsername)
      setPeers(prevPeers =>
        prevPeers.map(p =>
          p.userId === targetUserId
            ? { ...p, stream: remoteStream }
            : p
        )
      )
    })

    peer.on('connect', () => {
      console.log('Peer connected:', targetUsername)
    })

    peer.on('error', (err) => {
      console.error('Peer error:', err)
    })

    peer.on('close', () => {
      console.log('Peer connection closed:', targetUsername)
      removePeer(targetUserId)
    })

    const peerConnection: PeerConnection = {
      peerId: targetSocketId,
      peer,
      userId: targetUserId,
      username: targetUsername
    }

    peersRef.current.push(peerConnection)
    setPeers(prevPeers => [...prevPeers, peerConnection])

    return peer
  }, [isInitiator])

  // Remove peer connection
  const removePeer = useCallback((userId: string) => {
    const peerConnection = peersRef.current.find(p => p.userId === userId)
    if (peerConnection) {
      peerConnection.peer.destroy()
      peersRef.current = peersRef.current.filter(p => p.userId !== userId)
      setPeers(prevPeers => prevPeers.filter(p => p.userId !== userId))
    }
  }, [])

  // Handle incoming offer
  const handleOffer = useCallback((data: { fromUserId: string; fromUsername: string; offer: any }) => {
    if (!localStream) return

    console.log('Received offer from:', data.fromUsername)
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: localStream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    })

    peer.on('signal', (signal) => {
      if (signal.type === 'answer') {
        socketService.sendAnswer({ targetUserId: data.fromUserId, answer: signal })
      }
    })

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream from:', data.fromUsername)
      setPeers(prevPeers =>
        prevPeers.map(p =>
          p.userId === data.fromUserId
            ? { ...p, stream: remoteStream }
            : p
        )
      )
    })

    peer.on('connect', () => {
      console.log('Peer connected:', data.fromUsername)
    })

    peer.on('error', (err) => {
      console.error('Peer error:', err)
    })

    peer.on('close', () => {
      console.log('Peer connection closed:', data.fromUsername)
      removePeer(data.fromUserId)
    })

    peer.signal(data.offer)

    const peerConnection: PeerConnection = {
      peerId: data.fromUserId,
      peer,
      userId: data.fromUserId,
      username: data.fromUsername
    }

    peersRef.current.push(peerConnection)
    setPeers(prevPeers => [...prevPeers, peerConnection])
  }, [localStream, removePeer])

  // Handle incoming answer
  const handleAnswer = useCallback((data: { fromUserId: string; fromUsername: string; answer: any }) => {
    const peerConnection = peersRef.current.find(p => p.userId === data.fromUserId)
    if (peerConnection) {
      console.log('Received answer from:', data.fromUsername)
      peerConnection.peer.signal(data.answer)
    }
  }, [])

  // Handle ICE candidate
  const handleIceCandidate = useCallback((data: { fromUserId: string; candidate: any }) => {
    const peerConnection = peersRef.current.find(p => p.userId === data.fromUserId)
    if (peerConnection) {
      peerConnection.peer.signal(data.candidate)
    }
  }, [])

  // Initialize WebRTC when joining room
  const initializeWebRTC = useCallback((participants: Participant[], stream: MediaStream) => {
    console.log('Initializing WebRTC with participants:', participants.length)

    // Determine if this user should be the initiator
    // Usually the first participant or host initiates connections
    const sortedParticipants = participants.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    const currentUserIndex = sortedParticipants.findIndex(p => p.userId === userId)
    setIsInitiator(currentUserIndex === 0)

    // Create peer connections for existing participants
    participants.forEach(participant => {
      if (participant.userId !== userId) {
        createPeer(participant.userId, participant.username, participant.socketId, stream)
      }
    })
  }, [userId, createPeer])

  // Handle new participant joining
  const handleParticipantJoined = useCallback((data: { user: Participant }, stream: MediaStream) => {
    console.log('New participant joined:', data.user.username)
    if (data.user.userId !== userId) {
      createPeer(data.user.userId, data.user.username, data.user.socketId, stream)
    }
  }, [userId, createPeer])

  // Handle participant leaving
  const handleParticipantLeft = useCallback((data: { userId: string }) => {
    console.log('Participant left:', data.userId)
    removePeer(data.userId)
  }, [removePeer])

  // Update local stream for all peers
  const updateLocalStream = useCallback((newStream: MediaStream) => {
    peersRef.current.forEach(peerConnection => {
      const videoTrack = newStream.getVideoTracks()[0]
      const audioTrack = newStream.getAudioTracks()[0]

      // Access the underlying RTCPeerConnection through proper typing
      const peerInstance = peerConnection.peer as any
      const rtcPeerConnection = peerInstance._pc as RTCPeerConnection

      if (rtcPeerConnection) {
        const videoSender = rtcPeerConnection.getSenders().find((s: RTCRtpSender) => s.track?.kind === 'video')
        if (videoSender && videoTrack) {
          videoSender.replaceTrack(videoTrack)
        }

        const audioSender = rtcPeerConnection.getSenders().find((s: RTCRtpSender) => s.track?.kind === 'audio')
        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack)
        }
      }
    })
  }, [])

  // Cleanup
  const cleanup = useCallback(() => {
    peersRef.current.forEach(peerConnection => {
      peerConnection.peer.destroy()
    })
    peersRef.current = []
    setPeers([])
  }, [])

  // Set up socket listeners
  useEffect(() => {
    socketService.onOffer(handleOffer)
    socketService.onAnswer(handleAnswer)
    socketService.onIceCandidate(handleIceCandidate)

    return () => {
      socketService.removeAllListeners()
    }
  }, [handleOffer, handleAnswer, handleIceCandidate])

  return {
    peers,
    initializeWebRTC,
    handleParticipantJoined,
    handleParticipantLeft,
    updateLocalStream,
    cleanup
  }
}

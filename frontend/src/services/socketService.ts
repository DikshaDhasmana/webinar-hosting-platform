import { io, Socket } from 'socket.io-client'

export interface Participant {
  id?: string
  userId: string
  socketId: string
  username: string
  firstName: string
  lastName: string
  role: string
  joinedAt: string
  audioEnabled: boolean
  videoEnabled: boolean
  screenSharing: boolean
  handRaised: boolean
}

export interface ChatMessage {
  id: string
  userId: string
  username: string
  firstName: string
  lastName: string
  message: string
  timestamp: string
  role: string
}

class SocketService {
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io('http://localhost:5000', {
        auth: { token },
        transports: ['websocket', 'polling']
      })

      this.socket.on('connect', () => {
        console.log('Connected to socket server')
        this.reconnectAttempts = 0
        resolve()
      })

      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error)
        this.reconnectAttempts++

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Failed to connect to socket server'))
        }
      })

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected from socket server:', reason)
      })
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  // Room operations
  joinRoom(data: { roomId: string }) {
    this.socket?.emit('join-room', data)
  }

  leaveRoom(data: { roomId: string }) {
    this.socket?.emit('leave-room', data)
  }

  // WebRTC signaling
  sendOffer(data: { targetUserId: string; offer: any }) {
    this.socket?.emit('offer', data)
  }

  sendAnswer(data: { targetUserId: string; answer: any }) {
    this.socket?.emit('answer', data)
  }

  sendIceCandidate(data: { targetUserId: string; candidate: any }) {
    this.socket?.emit('ice-candidate', data)
  }

  // Media controls
  toggleAudio(data: { enabled: boolean }) {
    this.socket?.emit('toggle-audio', data)
  }

  toggleVideo(data: { enabled: boolean }) {
    this.socket?.emit('toggle-video', data)
  }

  startScreenShare() {
    this.socket?.emit('start-screen-share')
  }

  stopScreenShare() {
    this.socket?.emit('stop-screen-share')
  }

  // Chat and reactions
  sendMessage(data: { message: string }) {
    this.socket?.emit('send-message', data)
  }

  sendReaction(data: { reaction: string }) {
    this.socket?.emit('send-reaction', data)
  }

  // Hand raise
  raiseHand() {
    this.socket?.emit('raise-hand')
  }

  lowerHand() {
    this.socket?.emit('lower-hand')
  }

  // Host controls
  muteParticipant(data: { userId: string }) {
    this.socket?.emit('mute-participant', data)
  }

  removeParticipant(data: { userId: string }) {
    this.socket?.emit('remove-participant', data)
  }

  // Event listeners
  onRoomJoined(callback: (data: { roomId: string; webinar: any; participants: Participant[]; role: string }) => void) {
    this.socket?.on('room-joined', callback)
  }

  onParticipantJoined(callback: (data: { user: any }) => void) {
    this.socket?.on('participant-joined', callback)
  }

  onParticipantLeft(callback: (data: { userId: string; username: string }) => void) {
    this.socket?.on('participant-left', callback)
  }

  // WebRTC signaling listeners
  onOffer(callback: (data: { fromUserId: string; fromUsername: string; offer: any }) => void) {
    this.socket?.on('offer', callback)
  }

  onAnswer(callback: (data: { fromUserId: string; fromUsername: string; answer: any }) => void) {
    this.socket?.on('answer', callback)
  }

  onIceCandidate(callback: (data: { fromUserId: string; candidate: any }) => void) {
    this.socket?.on('ice-candidate', callback)
  }

  // Media control listeners
  onParticipantAudioChanged(callback: (data: { userId: string; audioEnabled: boolean }) => void) {
    this.socket?.on('participant-audio-changed', callback)
  }

  onParticipantVideoChanged(callback: (data: { userId: string; videoEnabled: boolean }) => void) {
    this.socket?.on('participant-video-changed', callback)
  }

  onScreenShareStarted(callback: (data: { userId: string; username: string }) => void) {
    this.socket?.on('screen-share-started', callback)
  }

  onScreenShareStopped(callback: (data: { userId: string }) => void) {
    this.socket?.on('screen-share-stopped', callback)
  }

  // Chat listeners
  onNewMessage(callback: (message: ChatMessage) => void) {
    this.socket?.on('new-message', callback)
  }

  onChatHistory(callback: (messages: ChatMessage[]) => void) {
    this.socket?.on('chat-history', callback)
  }

  // Reaction listeners
  onNewReaction(callback: (data: { userId: string; username: string; reaction: string; timestamp: string }) => void) {
    this.socket?.on('new-reaction', callback)
  }

  // Hand raise listeners
  onHandRaised(callback: (data: { userId: string; username: string; firstName: string; lastName: string }) => void) {
    this.socket?.on('hand-raised', callback)
  }

  onHandLowered(callback: (data: { userId: string }) => void) {
    this.socket?.on('hand-lowered', callback)
  }

  // Host control listeners
  onForceMute(callback: () => void) {
    this.socket?.on('force-mute', callback)
  }

  onRemovedFromRoom(callback: (data: { reason: string }) => void) {
    this.socket?.on('removed-from-room', callback)
  }

  // Error handling
  onError(callback: (data: { message: string }) => void) {
    this.socket?.on('error', callback)
  }

  // Remove all listeners
  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners()
    }
  }
}

export const socketService = new SocketService()

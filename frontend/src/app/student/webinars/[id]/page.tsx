'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import io, { Socket } from 'socket.io-client';

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

interface Participant {
  id: string;
  name: string;
  role: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
}

interface ChatMessage {
  id: string;
  participantId: string;
  participantName: string;
  message: string;
  timestamp: Date;
  role: string;
}

export default function WebinarRoom({ params }: { params: Promise<{ id: string }> }) {
  const { token, user } = useAuth();
  const router = useRouter();
  const resolvedParams = use(params);
  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    initializeWebinar();
    return () => {
      cleanup();
    };
  }, [token, resolvedParams.id]);

  const initializeWebinar = async () => {
    try {
      // Connect to Socket.IO
      const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
        auth: {
          token: token
        }
      });

      socketRef.current = socket;

      // Socket event handlers
      socket.on('connect', () => {
        console.log('Connected to server');
        setIsConnected(true);
        joinWebinar(socket);
      });

      socket.on('disconnect', () => {
        console.log('Disconnected from server');
        setIsConnected(false);
      });

      socket.on('webinar-joined', (data) => {
        console.log('Joined webinar:', data);
        setWebinar(data.webinar);
        setParticipants(data.participants);
        setIsLoading(false);
      });

      socket.on('participant-joined', (data) => {
        console.log('Participant joined:', data);
        // Update participants list
      });

      socket.on('participant-left', (data) => {
        console.log('Participant left:', data);
        // Update participants list
      });

      socket.on('chat-message', (message) => {
        setChatMessages(prev => [...prev, message]);
      });

      socket.on('webrtc-offer', handleWebRTCOffer);
      socket.on('webrtc-answer', handleWebRTCAnswer);
      socket.on('webrtc-ice-candidate', handleIceCandidate);

      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });

    } catch (error) {
      console.error('Error initializing webinar:', error);
      setIsLoading(false);
    }
  };

  const joinWebinar = (socket: Socket) => {
    socket.emit('join-webinar', {
      webinarId: resolvedParams.id,
      role: 'attendee'
    });
  };

  const handleWebRTCOffer = async (data: any) => {
    const { fromParticipantId, offer, connectionId } = data;

    try {
      const peerConnection = createPeerConnection(fromParticipantId);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socketRef.current?.emit('webrtc-answer', {
        targetParticipantId: fromParticipantId,
        answer,
        connectionId
      });
    } catch (error) {
      console.error('Error handling WebRTC offer:', error);
    }
  };

  const handleWebRTCAnswer = async (data: any) => {
    const { answer } = data;

    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('Error handling WebRTC answer:', error);
    }
  };

  const handleIceCandidate = async (data: any) => {
    const { candidate } = data;

    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };

  const createPeerConnection = (targetParticipantId: string) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    peerConnectionRef.current = peerConnection;

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('webrtc-ice-candidate', {
          targetParticipantId,
          candidate: event.candidate,
          connectionId: `${user?.id}-${targetParticipantId}`
        });
      }
    };

    return peerConnection;
  };

  const toggleAudio = async () => {
    try {
      if (!localStreamRef.current) {
        await startLocalStream();
      }

      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        socketRef.current?.emit('toggle-audio', audioTrack.enabled);
      }
    } catch (error) {
      console.error('Error toggling audio:', error);
    }
  };

  const toggleVideo = async () => {
    try {
      if (!localStreamRef.current) {
        await startLocalStream();
      }

      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        socketRef.current?.emit('toggle-video', videoTrack.enabled);
      }
    } catch (error) {
      console.error('Error toggling video:', error);
    }
  };

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Add tracks to existing peer connection
      if (peerConnectionRef.current) {
        stream.getTracks().forEach(track => {
          peerConnectionRef.current!.addTrack(track, stream);
        });
      }
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => {
            if (track.kind === 'video' && track.label.includes('screen')) {
              track.stop();
            }
          });
        }
        setIsScreenSharing(false);
        socketRef.current?.emit('stop-screen-share');
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Replace video track in peer connection
        if (peerConnectionRef.current) {
          const videoTrack = screenStream.getVideoTracks()[0];
          const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        }

        setIsScreenSharing(true);
        socketRef.current?.emit('start-screen-share');

        // Handle screen share stop
        screenStream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };
      }
    } catch (error) {
      console.error('Error toggling screen share:', error);
    }
  };

  const sendMessage = () => {
    if (newMessage.trim() && socketRef.current) {
      socketRef.current.emit('chat-message', {
        message: newMessage.trim()
      });
      setNewMessage('');
    }
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-white">Connecting to webinar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">{webinar?.title}</h1>
            <p className="text-gray-400">Host: {webinar?.hostName}</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <button
              onClick={() => router.back()}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            >
              Leave
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Video Area */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            {/* Local Video */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="p-2 bg-gray-700">
                <h3 className="text-sm font-medium">You</h3>
              </div>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            </div>

            {/* Remote Video */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="p-2 bg-gray-700">
                <h3 className="text-sm font-medium">Remote</h3>
              </div>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="mt-4 flex justify-center space-x-4">
            <button
              onClick={toggleAudio}
              className={`p-3 rounded-full ${
                isAudioEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full ${
                isVideoEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>

            <button
              onClick={toggleScreenShare}
              className={`p-3 rounded-full ${
                isScreenSharing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 flex flex-col">
          {/* Participants */}
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-medium mb-3">Participants ({participants.length})</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {participants.map((participant) => (
                <div key={participant.id} className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium">
                      {participant.name.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{participant.name}</p>
                    <div className="flex items-center space-x-1">
                      {participant.isAudioEnabled && (
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                        </svg>
                      )}
                      {participant.isVideoEnabled && (
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 p-4 flex flex-col">
            <h3 className="text-lg font-medium mb-3">Chat</h3>
            <div className="flex-1 overflow-y-auto mb-4">
              <div className="space-y-2">
                {chatMessages.map((message) => (
                  <div key={message.id} className="bg-gray-700 rounded p-2">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-medium text-blue-400">{message.participantName}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm">{message.message}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendMessage}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

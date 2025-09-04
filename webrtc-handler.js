// webrtc-handler.js - WebRTC Integration for Webinar Platform
const EventEmitter = require('events');

class WebRTCHandler extends EventEmitter {
  constructor(io, redis) {
    super();
    this.io = io;
    this.redis = redis;
    this.peerConnections = new Map();
    this.streamingSessions = new Map();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this.handleSocketConnection(socket);
    });
  }

  handleSocketConnection(socket) {
    // WebRTC Offer/Answer Exchange
    socket.on('webrtc-offer', async (data) => {
      try {
        await this.handleOffer(socket, data);
      } catch (error) {
        console.error('Error handling WebRTC offer:', error);
        socket.emit('webrtc-error', { message: 'Failed to handle offer' });
      }
    });

    socket.on('webrtc-answer', async (data) => {
      try {
        await this.handleAnswer(socket, data);
      } catch (error) {
        console.error('Error handling WebRTC answer:', error);
        socket.emit('webrtc-error', { message: 'Failed to handle answer' });
      }
    });

    socket.on('webrtc-ice-candidate', async (data) => {
      try {
        await this.handleIceCandidate(socket, data);
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
        socket.emit('webrtc-error', { message: 'Failed to handle ICE candidate' });
      }
    });

    // Streaming Controls
    socket.on('start-streaming', async (data) => {
      try {
        await this.startStreaming(socket, data);
      } catch (error) {
        console.error('Error starting stream:', error);
        socket.emit('streaming-error', { message: 'Failed to start streaming' });
      }
    });

    socket.on('stop-streaming', async (data) => {
      try {
        await this.stopStreaming(socket, data);
      } catch (error) {
        console.error('Error stopping stream:', error);
        socket.emit('streaming-error', { message: 'Failed to stop streaming' });
      }
    });

    // Bandwidth Optimization
    socket.on('bandwidth-info', (data) => {
      this.handleBandwidthInfo(socket, data);
    });

    // Quality Control
    socket.on('quality-preference', (data) => {
      this.handleQualityPreference(socket, data);
    });

    socket.on('disconnect', () => {
      this.cleanupPeerConnection(socket.id);
    });
  }

  async handleOffer(socket, data) {
    const { targetParticipantId, offer, webinarId, streamType } = data;
    
    // Validate participants are in the same webinar
    const isValidConnection = await this.validatePeerConnection(
      socket.participantId, 
      targetParticipantId, 
      webinarId
    );

    if (!isValidConnection) {
      socket.emit('webrtc-error', { message: 'Invalid peer connection' });
      return;
    }

    // Store peer connection info
    const connectionId = `${socket.participantId}-${targetParticipantId}`;
    this.peerConnections.set(connectionId, {
      initiator: socket.participantId,
      target: targetParticipantId,
      webinarId,
      streamType,
      status: 'offering',
      createdAt: Date.now()
    });

    // Forward offer to target participant
    const targetSocket = await this.findParticipantSocket(targetParticipantId);
    if (targetSocket) {
      targetSocket.emit('webrtc-offer', {
        fromParticipantId: socket.participantId,
        offer,
        streamType,
        connectionId
      });

      // Store in Redis for persistence across server instances
      await redisClient.set(
        `webrtc:offer:${connectionId}`,
        JSON.stringify({ offer, streamType, timestamp: Date.now() }),
        { EX: 300 } // 5 minutes TTL
      );
    } else {
      socket.emit('webrtc-error', { message: 'Target participant not found' });
    }
  }

  async handleAnswer(socket, data) {
    const { targetParticipantId, answer, connectionId } = data;
    
    const connection = this.peerConnections.get(connectionId);
    if (!connection) {
      socket.emit('webrtc-error', { message: 'Connection not found' });
      return;
    }

    // Update connection status
    connection.status = 'answered';
    this.peerConnections.set(connectionId, connection);

    // Forward answer to initiator
    const initiatorSocket = await this.findParticipantSocket(connection.initiator);
    if (initiatorSocket) {
      initiatorSocket.emit('webrtc-answer', {
        fromParticipantId: socket.participantId,
        answer,
        connectionId
      });

      // Store in Redis
      await redisClient.set(
        `webrtc:answer:${connectionId}`,
        JSON.stringify({ answer, timestamp: Date.now() }),
        { EX: 300 }
      );
    }
  }

  async handleIceCandidate(socket, data) {
    const { targetParticipantId, candidate, connectionId } = data;
    
    // Forward ICE candidate to target
    const targetSocket = await this.findParticipantSocket(targetParticipantId);
    if (targetSocket) {
      targetSocket.emit('webrtc-ice-candidate', {
        fromParticipantId: socket.participantId,
        candidate,
        connectionId
      });
    }
  }

  async startStreaming(socket, data) {
    const { webinarId, streamType, quality = 'hd' } = data;
    
    // Validate streaming permissions
    const hasPermission = await this.validateStreamingPermission(
      socket.participantId, 
      webinarId, 
      streamType
    );

    if (!hasPermission) {
      socket.emit('streaming-error', { message: 'No permission to stream' });
      return;
    }

    // Create streaming session
    const sessionId = `stream-${socket.participantId}-${Date.now()}`;
    const streamingSession = {
      sessionId,
      participantId: socket.participantId,
      webinarId,
      streamType,
      quality,
      startTime: Date.now(),
      viewers: new Set(),
      status: 'active'
    };

    this.streamingSessions.set(sessionId, streamingSession);

    // Notify webinar participants about new stream
    socket.to(webinarId).emit('stream-started', {
      participantId: socket.participantId,
      streamType,
      sessionId,
      quality
    });

    // Send streaming config to client
    socket.emit('streaming-started', {
      sessionId,
      config: this.getStreamingConfig(quality),
      iceServers: this.getIceServers()
    });

    // Store in Redis for load balancing
    await redisClient.set(
      `streaming:${sessionId}`,
      JSON.stringify(streamingSession),
      { EX: 3600 } // 1 hour
    );
  }

  async stopStreaming(socket, data) {
    const { sessionId } = data;
    
    const session = this.streamingSessions.get(sessionId);
    if (!session || session.participantId !== socket.participantId) {
      socket.emit('streaming-error', { message: 'Invalid streaming session' });
      return;
    }

    // Update session status
    session.status = 'stopped';
    session.endTime = Date.now();
    
    // Notify viewers
    socket.to(session.webinarId).emit('stream-stopped', {
      participantId: socket.participantId,
      sessionId
    });

    // Cleanup
    this.streamingSessions.delete(sessionId);
    await redisClient.del(`streaming:${sessionId}`);

    socket.emit('streaming-stopped', { sessionId });
  }

  handleBandwidthInfo(socket, data) {
    const { bandwidth, latency, packetLoss } = data;
    
    // Adaptive bitrate based on bandwidth
    let recommendedQuality = 'sd';
    if (bandwidth > 2000000) { // 2 Mbps
      recommendedQuality = 'hd';
    } else if (bandwidth > 1000000) { // 1 Mbps
      recommendedQuality = 'md';
    }

    // Adjust quality based on network conditions
    if (packetLoss > 5 || latency > 200) {
      recommendedQuality = 'sd';
    }

    socket.emit('quality-recommendation', {
      recommendedQuality,
      bandwidth: Math.round(bandwidth / 1000), // Convert to Kbps
      latency,
      packetLoss
    });
  }

  handleQualityPreference(socket, data) {
    const { quality, sessionId } = data;
    
    const session = this.streamingSessions.get(sessionId);
    if (session) {
      session.quality = quality;
      
      // Notify about quality change
      socket.to(session.webinarId).emit('stream-quality-changed', {
        sessionId,
        quality,
        participantId: session.participantId
      });
    }
  }

  getStreamingConfig(quality) {
    const configs = {
      'sd': {
        video: {
          width: 640,
          height: 480,
          frameRate: 15,
          bitrate: 500000
        },
        audio: {
          bitrate: 64000,
          sampleRate: 44100
        }
      },
      'md': {
        video: {
          width: 1280,
          height: 720,
          frameRate: 24,
          bitrate: 1500000
        },
        audio: {
          bitrate: 128000,
          sampleRate: 44100
        }
      },
      'hd': {
        video: {
          width: 1920,
          height: 1080,
          frameRate: 30,
          bitrate: 3000000
        },
        audio: {
          bitrate: 192000,
          sampleRate: 48000
        }
      }
    };

    return configs[quality] || configs['sd'];
  }

  getIceServers() {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: process.env.TURN_SERVER || 'turn:your-turn-server.com:3478',
        username: process.env.TURN_USERNAME || 'webinar_user',
        credential: process.env.TURN_PASSWORD || 'secure_password'
      }
    ];
  }

  async validatePeerConnection(initiatorId, targetId, webinarId) {
    // Check if both participants are in the same webinar
    const initiatorInWebinar = await redisClient.sismember(`webinar:${webinarId}:participants`, initiatorId);
    const targetInWebinar = await redisClient.sismember(`webinar:${webinarId}:participants`, targetId);

    return initiatorInWebinar && targetInWebinar;
  }

  async validateStreamingPermission(participantId, webinarId, streamType) {
    // Check if participant has streaming permission
    const isHost = await this.redis.get(`webinar:${webinarId}:host`) === participantId;
    const isPresenter = await this.redis.sismember(`webinar:${webinarId}:presenters`, participantId);
    const isModerator = await this.redis.sismember(`webinar:${webinarId}:moderators`, participantId);
    
    // Screen sharing only for authorized users
    if (streamType === 'screen') {
      return isHost || isPresenter || isModerator;
    }
    
    // Video/audio streaming based on webinar settings
    const settings = await this.redis.get(`webinar:${webinarId}:settings`);
    if (settings) {
      const parsedSettings = JSON.parse(settings);
      if (streamType === 'video' && !parsedSettings.allowParticipantVideo) {
        return isHost || isPresenter || isModerator;
      }
      if (streamType === 'audio' && !parsedSettings.allowParticipantAudio) {
        return isHost || isPresenter || isModerator;
      }
    }
    
    return true;
  }

  async findParticipantSocket(participantId) {
    // In a clustered environment, you might need to use Redis to find which server instance has the socket
    const sockets = await this.io.fetchSockets();
    return sockets.find(socket => socket.participantId === participantId);
  }

  cleanupPeerConnection(socketId) {
    // Remove all peer connections associated with this socket
    for (const [connectionId, connection] of this.peerConnections.entries()) {
      if (connection.initiator === socketId || connection.target === socketId) {
        this.peerConnections.delete(connectionId);
      }
    }

    // Cleanup streaming sessions
    for (const [sessionId, session] of this.streamingSessions.entries()) {
      if (session.participantId === socketId) {
        this.streamingSessions.delete(sessionId);
        this.redis.del(`streaming:${sessionId}`);
      }
    }
  }

  // Analytics and monitoring
  getConnectionStats() {
    return {
      activePeerConnections: this.peerConnections.size,
      activeStreamingSessions: this.streamingSessions.size,
      totalBandwidthUsage: this.calculateTotalBandwidth()
    };
  }

  calculateTotalBandwidth() {
    let totalBandwidth = 0;
    for (const session of this.streamingSessions.values()) {
      const config = this.getStreamingConfig(session.quality);
      totalBandwidth += config.video.bitrate + config.audio.bitrate;
    }
    return totalBandwidth;
  }
}

module.exports = WebRTCHandler;

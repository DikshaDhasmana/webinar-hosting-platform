const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Webinar = require('../models/Webinar');
const logger = require('../utils/logger');

// Redis keys
const ROOM_PRESENCE_KEY = (roomId) => `room:${roomId}:presence`;
const ROOM_CHAT_KEY = (roomId) => `room:${roomId}:chat`;
const RATE_LIMIT_KEY = (userId, action) => `ratelimit:${userId}:${action}`;

class SocketHandler {
  constructor(io, redisClient) {
    this.io = io;
    this.redis = redisClient;
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));
  }

  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication failed'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      const user = await User.findById(decoded.userId);

      if (!user || !user.isActive) {
        return next(new Error('Authentication failed'));
      }

      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  }

  handleConnection(socket) {
    logger.info(`User connected: ${socket.user.username} (${socket.id})`);

    // Join user to their personal room for notifications
    socket.join(`user:${socket.user._id}`);

    // Handle webinar room operations
    socket.on('join-room', this.handleJoinRoom.bind(this, socket));
    socket.on('leave-room', this.handleLeaveRoom.bind(this, socket));

    // WebRTC signaling
    socket.on('offer', this.handleOffer.bind(this, socket));
    socket.on('answer', this.handleAnswer.bind(this, socket));
    socket.on('ice-candidate', this.handleIceCandidate.bind(this, socket));

    // Media controls
    socket.on('toggle-audio', this.handleToggleAudio.bind(this, socket));
    socket.on('toggle-video', this.handleToggleVideo.bind(this, socket));
    socket.on('start-screen-share', this.handleStartScreenShare.bind(this, socket));
    socket.on('stop-screen-share', this.handleStopScreenShare.bind(this, socket));

    // Chat and reactions
    socket.on('send-message', this.handleSendMessage.bind(this, socket));
    socket.on('send-reaction', this.handleSendReaction.bind(this, socket));

    // Hand raise
    socket.on('raise-hand', this.handleRaiseHand.bind(this, socket));
    socket.on('lower-hand', this.handleLowerHand.bind(this, socket));

    // Presenter controls (host only)
    socket.on('mute-participant', this.handleMuteParticipant.bind(this, socket));
    socket.on('remove-participant', this.handleRemoveParticipant.bind(this, socket));

    // Disconnect handler
    socket.on('disconnect', this.handleDisconnect.bind(this, socket));
  }

  async handleJoinRoom(socket, data) {
    try {
      const { roomId } = data;
      
      if (!roomId) {
        socket.emit('error', { message: 'Room ID is required' });
        return;
      }

      // Find webinar
      const webinar = await Webinar.findOne({ roomId }).populate('host');
      
      if (!webinar) {
        socket.emit('error', { message: 'Webinar not found' });
        return;
      }

      // Check permissions
      if (socket.user.role === 'student' && !webinar.isPublic) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      if (socket.user.role === 'student' && webinar.status !== 'live') {
        socket.emit('error', { message: 'Webinar is not live' });
        return;
      }

      // Check room capacity
      const roomParticipants = await this.redis.sCard(ROOM_PRESENCE_KEY(roomId));
      if (roomParticipants >= webinar.maxParticipants) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      // Join socket room
      socket.join(roomId);
      socket.currentRoom = roomId;

      // Add to Redis presence
      await this.redis.sAdd(ROOM_PRESENCE_KEY(roomId), JSON.stringify({
        userId: socket.user._id,
        socketId: socket.id,
        username: socket.user.username,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName,
        role: this.getUserRoleInWebinar(socket.user, webinar),
        joinedAt: new Date(),
        audioEnabled: false,
        videoEnabled: false,
        screenSharing: false,
        handRaised: false
      }));

      // Add participant to webinar
      const participantRole = this.getUserRoleInWebinar(socket.user, webinar);
      webinar.addParticipant(socket.user._id, participantRole);
      await webinar.save();

      // Get current room participants
      const participants = await this.getRoomParticipants(roomId);

      logger.info(`Room ${roomId} participants after join:`, participants);

      // Notify others about new participant
      socket.to(roomId).emit('participant-joined', {
        user: {
          id: socket.user._id,
          username: socket.user.username,
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
          role: participantRole
        }
      });

      // Send room state to joining user
      logger.info(`Emitting room-joined to ${socket.user.username} with ${participants.length} participants`);
      socket.emit('room-joined', {
        roomId,
        webinar: {
          id: webinar._id,
          title: webinar.title,
          description: webinar.description,
          settings: webinar.settings,
          host: webinar.host
        },
        participants,
        role: participantRole
      });

      // Load recent chat messages
      const chatMessages = await this.getChatHistory(roomId);
      socket.emit('chat-history', chatMessages);

      logger.info(`User ${socket.user.username} joined room ${roomId}`);

    } catch (error) {
      logger.error('Join room error:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  }

  async handleLeaveRoom(socket, data) {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      await this.leaveRoom(socket, roomId);

    } catch (error) {
      logger.error('Leave room error:', error);
    }
  }

  async leaveRoom(socket, roomId) {
    try {
      // Remove from Redis presence
      const participants = await this.redis.sMembers(ROOM_PRESENCE_KEY(roomId));
      const userParticipant = participants.find(p => {
        const participant = JSON.parse(p);
        return participant.userId === socket.user._id.toString();
      });

      if (userParticipant) {
        await this.redis.sRem(ROOM_PRESENCE_KEY(roomId), userParticipant);
      }

      // Update webinar participant
      const webinar = await Webinar.findOne({ roomId });
      if (webinar) {
        webinar.removeParticipant(socket.user._id);
        await webinar.save();
      }

      // Leave socket room
      socket.leave(roomId);
      socket.currentRoom = null;

      // Notify others about participant leaving
      socket.to(roomId).emit('participant-left', {
        userId: socket.user._id,
        username: socket.user.username
      });

      logger.info(`User ${socket.user.username} left room ${roomId}`);

    } catch (error) {
      logger.error('Leave room error:', error);
    }
  }

  // WebRTC Signaling Handlers
  handleOffer(socket, data) {
    const { targetUserId, offer } = data;
    socket.to(`user:${targetUserId}`).emit('offer', {
      fromUserId: socket.user._id,
      fromUsername: socket.user.username,
      offer
    });
  }

  handleAnswer(socket, data) {
    const { targetUserId, answer } = data;
    socket.to(`user:${targetUserId}`).emit('answer', {
      fromUserId: socket.user._id,
      fromUsername: socket.user.username,
      answer
    });
  }

  handleIceCandidate(socket, data) {
    const { targetUserId, candidate } = data;
    socket.to(`user:${targetUserId}`).emit('ice-candidate', {
      fromUserId: socket.user._id,
      candidate
    });
  }

  // Media Control Handlers
  async handleToggleAudio(socket, data) {
    try {
      const { enabled } = data;
      const roomId = socket.currentRoom;
      
      if (!roomId) return;

      await this.updateParticipantState(roomId, socket.user._id, { audioEnabled: enabled });
      
      socket.to(roomId).emit('participant-audio-changed', {
        userId: socket.user._id,
        audioEnabled: enabled
      });

    } catch (error) {
      logger.error('Toggle audio error:', error);
    }
  }

  async handleToggleVideo(socket, data) {
    try {
      const { enabled } = data;
      const roomId = socket.currentRoom;
      
      if (!roomId) return;

      await this.updateParticipantState(roomId, socket.user._id, { videoEnabled: enabled });
      
      socket.to(roomId).emit('participant-video-changed', {
        userId: socket.user._id,
        videoEnabled: enabled
      });

    } catch (error) {
      logger.error('Toggle video error:', error);
    }
  }

  async handleStartScreenShare(socket, data) {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      const webinar = await Webinar.findOne({ roomId });
      if (!webinar) return;

      const userRole = this.getUserRoleInWebinar(socket.user, webinar);
      
      // Check permissions
      if (userRole !== 'host' && !webinar.settings.allowScreenShare) {
        socket.emit('error', { message: 'Screen sharing not allowed' });
        return;
      }

      await this.updateParticipantState(roomId, socket.user._id, { screenSharing: true });
      
      socket.to(roomId).emit('screen-share-started', {
        userId: socket.user._id,
        username: socket.user.username
      });

    } catch (error) {
      logger.error('Start screen share error:', error);
    }
  }

  async handleStopScreenShare(socket, data) {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      await this.updateParticipantState(roomId, socket.user._id, { screenSharing: false });
      
      socket.to(roomId).emit('screen-share-stopped', {
        userId: socket.user._id
      });

    } catch (error) {
      logger.error('Stop screen share error:', error);
    }
  }

  // Chat and Reaction Handlers
  async handleSendMessage(socket, data) {
    try {
      const { message } = data;
      const roomId = socket.currentRoom;
      
      if (!roomId) return;

      // Rate limiting for chat
      if (await this.isRateLimited(socket.user._id, 'chat', 10, 60)) {
        socket.emit('error', { message: 'Too many messages. Please slow down.' });
        return;
      }

      const webinar = await Webinar.findOne({ roomId });
      if (!webinar || !webinar.settings.allowChat) {
        socket.emit('error', { message: 'Chat is disabled' });
        return;
      }

      const chatMessage = {
        id: Date.now(),
        userId: socket.user._id,
        username: socket.user.username,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName,
        message: message.trim(),
        timestamp: new Date(),
        role: this.getUserRoleInWebinar(socket.user, webinar)
      };

      // Store in Redis
      await this.redis.lPush(ROOM_CHAT_KEY(roomId), JSON.stringify(chatMessage));
      await this.redis.lTrim(ROOM_CHAT_KEY(roomId), 0, 99); // Keep last 100 messages

      // Broadcast to room
      this.io.to(roomId).emit('new-message', chatMessage);

    } catch (error) {
      logger.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  async handleSendReaction(socket, data) {
    try {
      const { reaction } = data;
      const roomId = socket.currentRoom;
      
      if (!roomId) return;

      // Rate limiting for reactions
      if (await this.isRateLimited(socket.user._id, 'reaction', 20, 60)) {
        socket.emit('error', { message: 'Too many reactions. Please slow down.' });
        return;
      }

      const webinar = await Webinar.findOne({ roomId });
      if (!webinar || !webinar.settings.allowReactions) {
        socket.emit('error', { message: 'Reactions are disabled' });
        return;
      }

      const reactionData = {
        userId: socket.user._id,
        username: socket.user.username,
        reaction,
        timestamp: new Date()
      };

      // Broadcast to room
      socket.to(roomId).emit('new-reaction', reactionData);

    } catch (error) {
      logger.error('Send reaction error:', error);
    }
  }

  // Hand Raise Handlers
  async handleRaiseHand(socket, data) {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      await this.updateParticipantState(roomId, socket.user._id, { handRaised: true });
      
      this.io.to(roomId).emit('hand-raised', {
        userId: socket.user._id,
        username: socket.user.username,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName
      });

    } catch (error) {
      logger.error('Raise hand error:', error);
    }
  }

  async handleLowerHand(socket, data) {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      await this.updateParticipantState(roomId, socket.user._id, { handRaised: false });
      
      this.io.to(roomId).emit('hand-lowered', {
        userId: socket.user._id
      });

    } catch (error) {
      logger.error('Lower hand error:', error);
    }
  }

  // Host Control Handlers
  async handleMuteParticipant(socket, data) {
    try {
      const { userId } = data;
      const roomId = socket.currentRoom;
      
      if (!roomId) return;

      const webinar = await Webinar.findOne({ roomId });
      if (!webinar) return;

      // Check if user is host
      if (webinar.host.toString() !== socket.user._id.toString()) {
        socket.emit('error', { message: 'Only host can mute participants' });
        return;
      }

      // Mute the participant
      this.io.to(`user:${userId}`).emit('force-mute');
      
      await this.updateParticipantState(roomId, userId, { audioEnabled: false });

      socket.to(roomId).emit('participant-audio-changed', {
        userId,
        audioEnabled: false
      });

    } catch (error) {
      logger.error('Mute participant error:', error);
    }
  }

  async handleRemoveParticipant(socket, data) {
    try {
      const { userId } = data;
      const roomId = socket.currentRoom;
      
      if (!roomId) return;

      const webinar = await Webinar.findOne({ roomId });
      if (!webinar) return;

      // Check if user is host
      if (webinar.host.toString() !== socket.user._id.toString()) {
        socket.emit('error', { message: 'Only host can remove participants' });
        return;
      }

      // Remove the participant
      this.io.to(`user:${userId}`).emit('removed-from-room', {
        reason: 'Removed by host'
      });

    } catch (error) {
      logger.error('Remove participant error:', error);
    }
  }

  async handleDisconnect(socket) {
    try {
      logger.info(`User disconnected: ${socket.user.username} (${socket.id})`);

      // Leave current room if in one
      if (socket.currentRoom) {
        await this.leaveRoom(socket, socket.currentRoom);
      }

    } catch (error) {
      logger.error('Disconnect error:', error);
    }
  }

  // Helper Methods
  getUserRoleInWebinar(user, webinar) {
    if (webinar.host._id.toString() === user._id.toString()) {
      return 'host';
    }
    return 'attendee';
  }

  async getRoomParticipants(roomId) {
    try {
      const participants = await this.redis.sMembers(ROOM_PRESENCE_KEY(roomId));
      return participants.map(p => JSON.parse(p));
    } catch (error) {
      logger.error('Get room participants error:', error);
      return [];
    }
  }

  async updateParticipantState(roomId, userId, updates) {
    try {
      const participants = await this.redis.sMembers(ROOM_PRESENCE_KEY(roomId));
      const userParticipant = participants.find(p => {
        const participant = JSON.parse(p);
        return participant.userId === userId.toString();
      });

      if (userParticipant) {
        const participant = JSON.parse(userParticipant);
        Object.assign(participant, updates);
        
        await this.redis.sRem(ROOM_PRESENCE_KEY(roomId), userParticipant);
        await this.redis.sAdd(ROOM_PRESENCE_KEY(roomId), JSON.stringify(participant));
      }
    } catch (error) {
      logger.error('Update participant state error:', error);
    }
  }

  async getChatHistory(roomId, limit = 50) {
    try {
      const messages = await this.redis.lRange(ROOM_CHAT_KEY(roomId), 0, limit - 1);
      return messages.map(msg => JSON.parse(msg)).reverse();
    } catch (error) {
      logger.error('Get chat history error:', error);
      return [];
    }
  }

  async isRateLimited(userId, action, maxRequests, windowSeconds) {
    try {
      const key = RATE_LIMIT_KEY(userId, action);
      const current = await this.redis.incr(key);
      
      if (current === 1) {
        await this.redis.expire(key, windowSeconds);
      }
      
      return current > maxRequests;
    } catch (error) {
      logger.error('Rate limit check error:', error);
      return false; // Allow if Redis fails
    }
  }
}

module.exports = (io, redisClient) => {
  return new SocketHandler(io, redisClient);
};
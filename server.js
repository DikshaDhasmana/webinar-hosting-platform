// server.js - Main WebRTC Webinar Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Socket.IO setup with clustering support
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Redis setup for scalability
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
});

const redisAdapter = require('@socket.io/redis-adapter');
io.adapter(redisAdapter.createAdapter(redis, redis.duplicate()));

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// In-memory stores (use Redis in production)
const webinars = new Map();
const participants = new Map();
const chatMessages = new Map();

// WebRTC signaling data
const peerConnections = new Map();
const streamData = new Map();

// Webinar Class
class Webinar {
  constructor(id, title, hostId, maxParticipants = 500) {
    this.id = id;
    this.title = title;
    this.hostId = hostId;
    this.maxParticipants = maxParticipants;
    this.participants = new Set();
    this.presenters = new Set();
    this.moderators = new Set();
    this.isLive = false;
    this.startTime = null;
    this.endTime = null;
    this.chatEnabled = true;
    this.recordingEnabled = false;
    this.settings = {
      allowParticipantVideo: false,
      allowParticipantAudio: false,
      requireModeration: false
    };
  }

  addParticipant(userId, role = 'attendee') {
    if (this.participants.size >= this.maxParticipants) {
      throw new Error('Webinar is at maximum capacity');
    }
    
    this.participants.add(userId);
    
    if (role === 'presenter') {
      this.presenters.add(userId);
    } else if (role === 'moderator') {
      this.moderators.add(userId);
    }
    
    return true;
  }

  removeParticipant(userId) {
    this.participants.delete(userId);
    this.presenters.delete(userId);
    this.moderators.delete(userId);
  }

  canUserSpeak(userId) {
    return this.hostId === userId || 
           this.presenters.has(userId) || 
           this.moderators.has(userId);
  }

  getStats() {
    return {
      id: this.id,
      title: this.title,
      participantCount: this.participants.size,
      presenterCount: this.presenters.size,
      isLive: this.isLive,
      startTime: this.startTime,
      duration: this.startTime ? Date.now() - this.startTime : 0
    };
  }
}

// Participant Class
class Participant {
  constructor(id, name, socketId, role = 'attendee') {
    this.id = id;
    this.name = name;
    this.socketId = socketId;
    this.role = role;
    this.joinTime = Date.now();
    this.isAudioEnabled = false;
    this.isVideoEnabled = false;
    this.isScreenSharing = false;
    this.currentWebinar = null;
  }
}

// API Routes

// Create a new webinar
app.post('/api/webinars', async (req, res) => {
  try {
    const { title, hostName, maxParticipants = 500, settings = {} } = req.body;
    
    if (!title || !hostName) {
      return res.status(400).json({ error: 'Title and host name are required' });
    }

    const webinarId = `WEB-${uuidv4().slice(0, 8).toUpperCase()}`;
    const hostId = uuidv4();
    
    const webinar = new Webinar(webinarId, title, hostId, maxParticipants);
    Object.assign(webinar.settings, settings);
    
    webinars.set(webinarId, webinar);
    
    // Store in Redis for persistence
    await redis.setex(`webinar:${webinarId}`, 86400, JSON.stringify({
      id: webinarId,
      title,
      hostId,
      maxParticipants,
      settings,
      createdAt: Date.now()
    }));

    res.status(201).json({
      webinarId,
      hostId,
      title,
      maxParticipants,
      joinUrl: `${req.protocol}://${req.get('host')}/join/${webinarId}`
    });
  } catch (error) {
    console.error('Error creating webinar:', error);
    res.status(500).json({ error: 'Failed to create webinar' });
  }
});

// Get webinar details
app.get('/api/webinars/:id', async (req, res) => {
  try {
    const webinarId = req.params.id;
    let webinar = webinars.get(webinarId);
    
    if (!webinar) {
      // Try to load from Redis
      const webinarData = await redis.get(`webinar:${webinarId}`);
      if (webinarData) {
        const data = JSON.parse(webinarData);
        webinar = new Webinar(data.id, data.title, data.hostId, data.maxParticipants);
        Object.assign(webinar.settings, data.settings);
        webinars.set(webinarId, webinar);
      }
    }
    
    if (!webinar) {
      return res.status(404).json({ error: 'Webinar not found' });
    }

    res.json(webinar.getStats());
  } catch (error) {
    console.error('Error fetching webinar:', error);
    res.status(500).json({ error: 'Failed to fetch webinar' });
  }
});

// Join webinar endpoint
app.post('/api/webinars/:id/join', async (req, res) => {
  try {
    const webinarId = req.params.id;
    const { participantName, role = 'attendee' } = req.body;
    
    if (!participantName) {
      return res.status(400).json({ error: 'Participant name is required' });
    }

    const webinar = webinars.get(webinarId);
    if (!webinar) {
      return res.status(404).json({ error: 'Webinar not found' });
    }

    if (webinar.participants.size >= webinar.maxParticipants) {
      return res.status(403).json({ error: 'Webinar is at maximum capacity' });
    }

    const participantId = uuidv4();
    const participant = new Participant(participantId, participantName, null, role);
    
    participants.set(participantId, participant);
    
    res.json({
      participantId,
      webinarId,
      participantName,
      role,
      webinarTitle: webinar.title,
      canSpeak: webinar.canUserSpeak(participantId)
    });
  } catch (error) {
    console.error('Error joining webinar:', error);
    res.status(500).json({ error: 'Failed to join webinar' });
  }
});

// Get chat messages
app.get('/api/webinars/:id/messages', async (req, res) => {
  try {
    const webinarId = req.params.id;
    const messages = chatMessages.get(webinarId) || [];
    
    // Get recent messages (last 100)
    const recentMessages = messages.slice(-100);
    
    res.json(recentMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// WebSocket Event Handlers
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  let currentParticipant = null;
  let currentWebinar = null;

  // Join webinar room
  socket.on('join-webinar', async (data) => {
    try {
      const { webinarId, participantId, participantName, role } = data;
      
      const webinar = webinars.get(webinarId);
      if (!webinar) {
        socket.emit('error', { message: 'Webinar not found' });
        return;
      }

      // Update or create participant
      let participant = participants.get(participantId);
      if (!participant) {
        participant = new Participant(participantId, participantName, socket.id, role);
        participants.set(participantId, participant);
      } else {
        participant.socketId = socket.id;
      }

      try {
        webinar.addParticipant(participantId, role);
      } catch (error) {
        socket.emit('error', { message: error.message });
        return;
      }

      participant.currentWebinar = webinarId;
      currentParticipant = participant;
      currentWebinar = webinar;

      // Join socket room
      socket.join(webinarId);

      // Notify all participants about new joiner
      socket.to(webinarId).emit('participant-joined', {
        participantId,
        participantName,
        role,
        participantCount: webinar.participants.size
      });

      // Send current webinar state to new participant
      socket.emit('webinar-joined', {
        webinar: webinar.getStats(),
        participants: Array.from(webinar.participants).map(id => {
          const p = participants.get(id);
          return p ? {
            id: p.id,
            name: p.name,
            role: p.role,
            isAudioEnabled: p.isAudioEnabled,
            isVideoEnabled: p.isVideoEnabled,
            isScreenSharing: p.isScreenSharing
          } : null;
        }).filter(Boolean),
        canSpeak: webinar.canUserSpeak(participantId)
      });

      // Store participant count in Redis
      await redis.setex(`webinar:${webinarId}:count`, 300, webinar.participants.size);

    } catch (error) {
      console.error('Error joining webinar:', error);
      socket.emit('error', { message: 'Failed to join webinar' });
    }
  });

  // Handle chat messages
  socket.on('chat-message', async (data) => {
    try {
      if (!currentParticipant || !currentWebinar) {
        socket.emit('error', { message: 'Not in a webinar' });
        return;
      }

      const { message } = data;
      if (!message || message.trim().length === 0) {
        return;
      }

      // Rate limiting for chat (10 messages per minute)
      const rateLimitKey = `chat:${currentParticipant.id}`;
      const messageCount = await redis.incr(rateLimitKey);
      if (messageCount === 1) {
        await redis.expire(rateLimitKey, 60);
      }
      if (messageCount > 10) {
        socket.emit('error', { message: 'Chat rate limit exceeded' });
        return;
      }

      const chatMessage = {
        id: uuidv4(),
        participantId: currentParticipant.id,
        participantName: currentParticipant.name,
        message: message.trim(),
        timestamp: Date.now(),
        role: currentParticipant.role
      };

      // Store message
      if (!chatMessages.has(currentWebinar.id)) {
        chatMessages.set(currentWebinar.id, []);
      }
      const messages = chatMessages.get(currentWebinar.id);
      messages.push(chatMessage);
      
      // Keep only last 1000 messages
      if (messages.length > 1000) {
        messages.splice(0, messages.length - 1000);
      }

      // Broadcast to all participants
      io.to(currentWebinar.id).emit('chat-message', chatMessage);

      // Store in Redis for persistence
      await redis.lpush(`messages:${currentWebinar.id}`, JSON.stringify(chatMessage));
      await redis.ltrim(`messages:${currentWebinar.id}`, 0, 999);

    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // WebRTC Signaling
  socket.on('webrtc-offer', (data) => {
    const { targetParticipantId, offer } = data;
    const targetParticipant = participants.get(targetParticipantId);
    
    if (targetParticipant && targetParticipant.socketId) {
      io.to(targetParticipant.socketId).emit('webrtc-offer', {
        fromParticipantId: currentParticipant?.id,
        offer
      });
    }
  });

  socket.on('webrtc-answer', (data) => {
    const { targetParticipantId, answer } = data;
    const targetParticipant = participants.get(targetParticipantId);
    
    if (targetParticipant && targetParticipant.socketId) {
      io.to(targetParticipant.socketId).emit('webrtc-answer', {
        fromParticipantId: currentParticipant?.id,
        answer
      });
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const { targetParticipantId, candidate } = data;
    const targetParticipant = participants.get(targetParticipantId);
    
    if (targetParticipant && targetParticipant.socketId) {
      io.to(targetParticipant.socketId).emit('webrtc-ice-candidate', {
        fromParticipantId: currentParticipant?.id,
        candidate
      });
    }
  });

  // Media controls
  socket.on('toggle-audio', (enabled) => {
    if (currentParticipant && currentWebinar) {
      currentParticipant.isAudioEnabled = enabled;
      socket.to(currentWebinar.id).emit('participant-audio-changed', {
        participantId: currentParticipant.id,
        isAudioEnabled: enabled
      });
    }
  });

  socket.on('toggle-video', (enabled) => {
    if (currentParticipant && currentWebinar) {
      currentParticipant.isVideoEnabled = enabled;
      socket.to(currentWebinar.id).emit('participant-video-changed', {
        participantId: currentParticipant.id,
        isVideoEnabled: enabled
      });
    }
  });

  socket.on('start-screen-share', () => {
    if (currentParticipant && currentWebinar && currentWebinar.canUserSpeak(currentParticipant.id)) {
      currentParticipant.isScreenSharing = true;
      socket.to(currentWebinar.id).emit('screen-share-started', {
        participantId: currentParticipant.id,
        participantName: currentParticipant.name
      });
    }
  });

  socket.on('stop-screen-share', () => {
    if (currentParticipant && currentWebinar) {
      currentParticipant.isScreenSharing = false;
      socket.to(currentWebinar.id).emit('screen-share-stopped', {
        participantId: currentParticipant.id
      });
    }
  });

  // Host controls
  socket.on('start-webinar', () => {
    if (currentWebinar && currentWebinar.hostId === currentParticipant?.id) {
      currentWebinar.isLive = true;
      currentWebinar.startTime = Date.now();
      io.to(currentWebinar.id).emit('webinar-started', {
        startTime: currentWebinar.startTime
      });
    }
  });

  socket.on('end-webinar', () => {
    if (currentWebinar && currentWebinar.hostId === currentParticipant?.id) {
      currentWebinar.isLive = false;
      currentWebinar.endTime = Date.now();
      io.to(currentWebinar.id).emit('webinar-ended', {
        endTime: currentWebinar.endTime
      });
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    if (currentParticipant && currentWebinar) {
      currentWebinar.removeParticipant(currentParticipant.id);
      participants.delete(currentParticipant.id);
      
      socket.to(currentWebinar.id).emit('participant-left', {
        participantId: currentParticipant.id,
        participantName: currentParticipant.name,
        participantCount: currentWebinar.participants.size
      });
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: Date.now(),
    activeWebinars: webinars.size,
    totalParticipants: participants.size
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/join/:webinarId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    redis.disconnect();
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Webinar server running on port ${PORT}`);
  console.log(`📊 Redis connected: ${redis.status}`);
  console.log(`🎥 WebRTC signaling ready`);
  console.log(`💬 Socket.IO ready for ${process.env.NODE_ENV || 'development'} mode`);
});

module.exports = { app, server, io };
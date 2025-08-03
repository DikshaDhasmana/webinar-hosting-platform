// server.js - Main WebRTC Webinar Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

// Authentication constants
const JWT_SECRET = process.env.JWT_SECRET || 'webinar_platform_secret_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const SALT_ROUNDS = 10;

// Authentication Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user exists in Redis
    const userData = await redis.get(`user:${decoded.userId}`);
    if (!userData) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = {
      id: decoded.userId,
      ...JSON.parse(userData)
    };
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

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
app.post('/api/webinars', authenticateToken, async (req, res) => {
  try {
    const { title, maxParticipants = 500, settings = {} } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const webinarId = `WEB-${uuidv4().slice(0, 8).toUpperCase()}`;
    const hostId = req.user.id; // Use authenticated user ID as host ID
    
    const webinar = new Webinar(webinarId, title, hostId, maxParticipants);
    Object.assign(webinar.settings, settings);
    
    webinars.set(webinarId, webinar);
    
    // Store in Redis for persistence
    await redis.setex(`webinar:${webinarId}`, 86400, JSON.stringify({
      id: webinarId,
      title,
      hostId,
      hostName: req.user.name, // Store host name from authenticated user
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

// User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user already exists
    const existingUser = await redis.get(`user:email:${email}`);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user ID
    const userId = uuidv4();

    // Store user data in Redis
    const userData = {
      id: userId,
      name,
      email,
      createdAt: Date.now()
    };

    // Store user data
    await redis.setex(`user:${userId}`, 86400, JSON.stringify(userData)); // 24 hours
    await redis.setex(`user:email:${email}`, 86400, userId); // For email lookup
    await redis.setex(`user:password:${userId}`, 86400, hashedPassword); // Store hashed password

    // Generate JWT token
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(201).json({
      message: 'User registered successfully',
      userId,
      name,
      email,
      token
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const userId = await redis.get(`user:email:${email}`);
    if (!userId) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get user data
    const userData = await redis.get(`user:${userId}`);
    if (!userData) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get hashed password
    const hashedPassword = await redis.get(`user:password:${userId}`);
    if (!hashedPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, hashedPassword);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const user = JSON.parse(userData);
    res.json({
      message: 'Login successful',
      userId,
      name: user.name,
      email: user.email,
      token
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get user profile
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      userId: req.user.id,
      name: req.user.name,
      email: req.user.email,
      createdAt: req.user.createdAt
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get webinar details
app.get('/api/webinars/:id', authenticateToken, async (req, res) => {
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
app.post('/api/webinars/:id/join', authenticateToken, async (req, res) => {
  try {
    const webinarId = req.params.id;
    const { role = 'attendee' } = req.body;
    
    // Use authenticated user's name instead of requiring participantName
    const participantName = req.user.name;

    const webinar = webinars.get(webinarId);
    if (!webinar) {
      return res.status(404).json({ error: 'Webinar not found' });
    }

    if (webinar.participants.size >= webinar.maxParticipants) {
      return res.status(403).json({ error: 'Webinar is at maximum capacity' });
    }

    const participantId = req.user.id; // Use authenticated user ID as participant ID
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
app.get('/api/webinars/:id/messages', authenticateToken, async (req, res) => {
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
io.on('connection', async (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Extract JWT token from query parameters
  const token = socket.handshake.query.token;
  if (!token) {
    console.log('No token provided');
    socket.disconnect(true);
    return;
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user data from Redis
    const userData = await redis.get(`user:${decoded.userId}`);
    if (!userData) {
      console.log('User not found');
      socket.disconnect(true);
      return;
    }

    // Attach user data to socket
    socket.user = {
      id: decoded.userId,
      ...JSON.parse(userData)
    };

    console.log(`User connected: ${socket.user.id} (${socket.user.name})`);

    let currentParticipant = null;
    let currentWebinar = null;

  } catch (error) {
    console.error('Authentication error:', error);
    socket.disconnect(true);
    return;
  }

  // Join webinar room
  socket.on('join-webinar', async (data) => {
    try {
      const { webinarId, role } = data;
      
      // Use authenticated user data
      const participantId = socket.user.id;
      const participantName = socket.user.name;
      
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
    const { targetParticipantId, offer, connectionId } = data;
    const targetParticipant = participants.get(targetParticipantId);
    
    if (targetParticipant && targetParticipant.socketId) {
      io.to(targetParticipant.socketId).emit('webrtc-offer', {
        fromParticipantId: currentParticipant?.id,
        offer,
        connectionId
      });
    }
  });

  socket.on('webrtc-answer', (data) => {
    const { targetParticipantId, answer, connectionId } = data;
    const targetParticipant = participants.get(targetParticipantId);
    
    if (targetParticipant && targetParticipant.socketId) {
      io.to(targetParticipant.socketId).emit('webrtc-answer', {
        fromParticipantId: currentParticipant?.id,
        answer,
        connectionId
      });
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const { targetParticipantId, candidate, connectionId } = data;
    const targetParticipant = participants.get(targetParticipantId);
    
    if (targetParticipant && targetParticipant.socketId) {
      io.to(targetParticipant.socketId).emit('webrtc-ice-candidate', {
        fromParticipantId: currentParticipant?.id,
        candidate,
        connectionId
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

  // WebRTC connection management
  socket.on('create-peer-connection', (data) => {
    const { targetParticipantId, streamType } = data;
    const targetParticipant = participants.get(targetParticipantId);
    
    if (targetParticipant && targetParticipant.socketId) {
      const connectionId = `${currentParticipant.id}-${targetParticipantId}-${Date.now()}`;
      io.to(targetParticipant.socketId).emit('peer-connection-request', {
        fromParticipantId: currentParticipant.id,
        connectionId,
        streamType
      });
    }
  });

  socket.on('close-peer-connection', (data) => {
    const { connectionId } = data;
    // In a real implementation, you would close the peer connection
    console.log(`Peer connection closed: ${connectionId}`);
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

// Function to create default admin user
async function createDefaultAdminUser() {
  try {
    const adminEmail = 'dikshadhasmana230204@gmail.com';
    const adminPassword = 'admin';
    const adminName = 'Admin User';
    
    // Check if admin user already exists
    const existingUserId = await redis.get(`user:email:${adminEmail}`);
    if (existingUserId) {
      console.log('✅ Default admin user already exists');
      return;
    }
    
    // Create admin user
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    
    const userData = {
      id: userId,
      name: adminName,
      email: adminEmail,
      createdAt: Date.now()
    };
    
    // Store user data in Redis
    await redis.setex(`user:${userId}`, 86400, JSON.stringify(userData)); // 24 hours
    await redis.setex(`user:email:${adminEmail}`, 86400, userId); // For email lookup
    await redis.setex(`user:password:${userId}`, 86400, hashedPassword); // Store hashed password
    
    console.log('✅ Default admin user created successfully');
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword} (change after first login)`);
  } catch (error) {
    console.error('❌ Error creating default admin user:', error);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`🚀 Webinar server running on port ${PORT}`);
  console.log(`📊 Redis connected: ${redis.status}`);
  console.log(`🎥 WebRTC signaling ready`);
  console.log(`💬 Socket.IO ready for ${process.env.NODE_ENV || 'development'} mode`);
  
  // Create default admin user
  await createDefaultAdminUser();
});

module.exports = { app, server, io, createDefaultAdminUser };

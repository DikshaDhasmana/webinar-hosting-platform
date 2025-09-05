// server.js - Main WebRTC Webinar Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const redis = require('redis');

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Webinar = require('./models/Webinar');
const Participant = require('./models/Participant');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/webinar-platform', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define schemas and models
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true, unique: true },
  password: String,
  role: { type: String, enum: ['admin', 'student'], default: 'student' },
  createdAt: Date
});
const User = mongoose.model('User', userSchema);

// Webinar schema for MongoDB persistence
const webinarSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  hostId: String,
  hostName: String,
  maxParticipants: Number,
  settings: Object,
  createdAt: Date,
  isLive: Boolean,
  startTime: Date,
  endTime: Date,
  participants: [String],
  presenters: [String],
  moderators: [String]
});
const WebinarModel = mongoose.model('Webinar', webinarSchema);

const participantSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  socketId: String,
  role: String,
  joinTime: Date,
  isAudioEnabled: Boolean,
  isVideoEnabled: Boolean,
  isScreenSharing: Boolean,
  currentWebinar: String
});
const ParticipantModel = mongoose.model('Participant', participantSchema);

const chatMessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  webinarId: String,
  participantId: String,
  participantName: String,
  message: String,
  timestamp: Date,
  role: String
});
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

// Initialize Redis client
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
});

redisClient.on('connect', () => console.log('✅ Redis connected'));
redisClient.on('error', (err) => console.error('❌ Redis connection error:', err));
redisClient.on('ready', () => console.log('📊 Redis client ready'));
redisClient.on('end', () => console.log('🔌 Redis connection ended'));

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
  }
})();

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



// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
    const userData = await redisClient.get(`user:${decoded.userId}`);
    if (!userData) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = JSON.parse(userData);
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'student',
      createdAt: user.createdAt
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};



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
    
    // Use the Webinar class (imported from models/Webinar.js)
    const webinar = new Webinar(webinarId, title, hostId, maxParticipants);
    Object.assign(webinar.settings, settings);
    
    webinars.set(webinarId, webinar);
    
    // Store in Redis for persistence
    await redisClient.set(`webinar:${webinarId}`, JSON.stringify({
      id: webinarId,
      title,
      hostId,
      hostName: req.user.name, // Store host name from authenticated user
      maxParticipants,
      settings,
      createdAt: Date.now()
    }), { EX: 86400 });

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
    const { name, email, password, role = 'student' } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Validate role
    if (!['admin', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin or student' });
    }

    // Check if user already exists
    const existingUser = await redisClient.get(`user:email:${email}`);
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
      role,
      createdAt: Date.now()
    };

    // Store user data
    await redisClient.set(`user:${userId}`, JSON.stringify(userData), { EX: 86400 }); // 24 hours
    await redisClient.set(`user:email:${email}`, userId, { EX: 86400 }); // For email lookup
    await redisClient.set(`user:password:${userId}`, hashedPassword, { EX: 86400 }); // Store hashed password

    // Generate JWT token
    const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(201).json({
      message: 'User registered successfully',
      userId,
      name,
      email,
      role,
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
    const userId = await redisClient.get(`user:email:${email}`);
    if (!userId) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get user data
    const userData = await redisClient.get(`user:${userId}`);
    if (!userData) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get hashed password
    const hashedPassword = await redisClient.get(`user:password:${userId}`);
    if (!hashedPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, hashedPassword);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = JSON.parse(userData);

    // Generate JWT token
    const token = jwt.sign({ userId, role: user.role || 'student' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      message: 'Login successful',
      userId,
      name: user.name,
      email: user.email,
      role: user.role || 'student',
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

app.get('/api/webinars', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role || 'student';
    const webinarsList = [];

    // Get all webinar keys from Redis
    const webinarKeys = await redisClient.keys(`webinar:*`);
    for (const key of webinarKeys) {
      const webinarData = await redisClient.get(key);
      if (webinarData) {
        const data = JSON.parse(webinarData);
        // For admin, include only webinars created by them
        if (userRole === 'admin' && data.hostId === userId) {
          webinarsList.push({
            id: data.id,
            title: data.title,
            hostId: data.hostId,
            hostName: data.hostName,
            maxParticipants: data.maxParticipants,
            isLive: false, // Default to false, would need real-time status
            participants: [], // Initialize as empty array
            createdAt: data.createdAt
          });
        }
        // For students, include all webinars
        else if (userRole === 'student') {
          webinarsList.push({
            id: data.id,
            title: data.title,
            hostId: data.hostId,
            hostName: data.hostName,
            maxParticipants: data.maxParticipants,
            isLive: false,
            participants: [],
            createdAt: data.createdAt
          });
        }
      }
    }

    res.json(webinarsList);
  } catch (error) {
    console.error('Error fetching webinars:', error);
    res.status(500).json({ error: 'Failed to fetch webinars' });
  }
});

// Get webinar details
app.get('/api/webinars/:id', authenticateToken, async (req, res) => {
  try {
    const webinarId = req.params.id;
    let webinar = webinars.get(webinarId);

    if (!webinar) {
      // Try to load from Redis
      const webinarData = await redisClient.get(`webinar:${webinarId}`);
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
    const userData = await redisClient.get(`user:${decoded.userId}`);
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

      let webinar = webinars.get(webinarId);
      if (!webinar) {
        // Try to load from Redis
        const webinarData = await redisClient.get(`webinar:${webinarId}`);
        if (webinarData) {
          const data = JSON.parse(webinarData);
          webinar = new Webinar(data.id, data.title, data.hostId, data.maxParticipants);
          Object.assign(webinar.settings, data.settings);
          webinars.set(webinarId, webinar);
        }
      }

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
      await redisClient.set(`webinar:${webinarId}:count`, webinar.participants.size, { EX: 300 });

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
      let messageCount;
      try {
        messageCount = await redisClient.incr(rateLimitKey);
        if (messageCount === 1) {
          await redisClient.expire(rateLimitKey, 60);
        }
      } catch (redisError) {
        console.error('Redis rate limiting error:', redisError);
        // Continue without rate limiting if Redis fails
        messageCount = 1;
      }

      if (messageCount > 10) {
        socket.emit('error', { message: 'Chat rate limit exceeded' });
        return;
      }

      const chatMessage = {
        id: uuidv4(),
        webinarId: currentWebinar.id,
        participantId: currentParticipant.id,
        participantName: currentParticipant.name,
        message: message.trim(),
        timestamp: Date.now(),
        role: currentParticipant.role
      };

      // Store message in memory
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

      // Store in Redis for persistence (don't fail if Redis is down)
      try {
        await redisClient.lPush(`messages:${currentWebinar.id}`, JSON.stringify(chatMessage));
        await redisClient.lTrim(`messages:${currentWebinar.id}`, 0, 999);
      } catch (redisError) {
        console.error('Redis storage error (continuing without persistence):', redisError);
        // Don't emit error to client - message was already sent successfully
      }

    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to send message', details: error.message });
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
    redisClient.disconnect();
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
    const existingUserId = await redisClient.get(`user:email:${adminEmail}`);
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
      role: 'admin',
      createdAt: Date.now()
    };
    
    // Store user data in Redis
    await redisClient.set(`user:${userId}`, JSON.stringify(userData), { EX: 86400 }); // 24 hours
    await redisClient.set(`user:email:${adminEmail}`, userId, { EX: 86400 }); // For email lookup
    await redisClient.set(`user:password:${userId}`, hashedPassword, { EX: 86400 }); // Store hashed password
    
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
  console.log(`📊 Redis client initialized`);
  console.log(`🎥 WebRTC signaling ready`);
  console.log(`💬 Socket.IO ready for ${process.env.NODE_ENV || 'development'} mode`);

  // Create default admin user
  await createDefaultAdminUser();
});

module.exports = { app, server, io, createDefaultAdminUser };

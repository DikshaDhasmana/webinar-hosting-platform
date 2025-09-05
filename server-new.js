// server-new.js - Updated WebRTC Webinar Server with MongoDB + Redis Architecture
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

// Import new models
const UserModel = require('./models/User');
const WebinarModel = require('./models/Webinar');
const AttendanceModel = require('./models/Attendance');
const RecordingModel = require('./models/Recording');

// Legacy models (keeping for compatibility)
const WebinarClass = require('./models/Webinar');
const Participant = require('./models/Participant');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/webinar-platform', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

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

    // Check if user exists in MongoDB
    const user = await UserModel.findOne({ id: decoded.userId });
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

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
    const { title, description, scheduledDate, startTime, endTime, maxParticipants = 500, settings = {} } = req.body;

    if (!title || !scheduledDate || !startTime || !endTime) {
      return res.status(400).json({ error: 'Title, scheduled date, start time, and end time are required' });
    }

    const webinarId = `WEB-${uuidv4().slice(0, 8).toUpperCase()}`;
    const createdBy = req.user.id;

    // Create webinar in MongoDB
    const webinar = new WebinarModel({
      id: webinarId,
      title,
      description,
      scheduledDate: new Date(scheduledDate),
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      createdBy,
      maxParticipants,
      settings
    });

    await webinar.save();

    // Store in Redis for real-time state
    await redisClient.set(`webinar:${webinarId}`, JSON.stringify({
      id: webinarId,
      title,
      createdBy,
      status: 'scheduled',
      maxParticipants,
      settings,
      createdAt: Date.now()
    }), { EX: 86400 });

    res.status(201).json({
      webinarId,
      title,
      description,
      scheduledDate,
      startTime,
      endTime,
      createdBy,
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
    const { name, email, password, role = 'student', phone } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Validate role
    if (!['admin', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin or student' });
    }

    // Check if user already exists in MongoDB
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user ID
    const userId = uuidv4();

    // Create new user in MongoDB
    const newUser = new UserModel({
      id: userId,
      name,
      email,
      password: hashedPassword,
      role,
      phone,
      createdAt: new Date()
    });

    await newUser.save();

    // Store user data in Redis for session management (short-term cache)
    const userData = {
      id: userId,
      name,
      email,
      role,
      phone,
      createdAt: newUser.createdAt.getTime()
    };

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

    // Find user by email in MongoDB
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Store user data in Redis for session management
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      createdAt: user.createdAt.getTime()
    };

    await redisClient.set(`user:${user.id}`, JSON.stringify(userData), { EX: 86400 });
    await redisClient.set(`user:email:${email}`, user.id, { EX: 86400 });
    await redisClient.set(`user:password:${user.id}`, user.password, { EX: 86400 });

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      message: 'Login successful',
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
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
    const user = await UserModel.findOne({ id: req.user.id });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get webinars
app.get('/api/webinars', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role || 'student';

    let webinars;
    if (userRole === 'admin') {
      // Admins see webinars they created
      webinars = await WebinarModel.find({ createdBy: userId }).sort({ createdAt: -1 });
    } else {
      // Students see all webinars
      webinars = await WebinarModel.find({}).sort({ createdAt: -1 });
    }

    const webinarsList = webinars.map(webinar => ({
      id: webinar.id,
      title: webinar.title,
      description: webinar.description,
      scheduledDate: webinar.scheduledDate,
      startTime: webinar.startTime,
      endTime: webinar.endTime,
      createdBy: webinar.createdBy,
      status: webinar.status,
      maxParticipants: webinar.maxParticipants,
      registeredStudents: webinar.registeredStudents,
      createdAt: webinar.createdAt
    }));

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
    const webinar = await WebinarModel.findOne({ id: webinarId });

    if (!webinar) {
      return res.status(404).json({ error: 'Webinar not found' });
    }

    res.json({
      id: webinar.id,
      title: webinar.title,
      description: webinar.description,
      scheduledDate: webinar.scheduledDate,
      startTime: webinar.startTime,
      endTime: webinar.endTime,
      createdBy: webinar.createdBy,
      status: webinar.status,
      maxParticipants: webinar.maxParticipants,
      registeredStudents: webinar.registeredStudents,
      settings: webinar.settings,
      createdAt: webinar.createdAt
    });
  } catch (error) {
    console.error('Error fetching webinar:', error);
    res.status(500).json({ error: 'Failed to fetch webinar' });
  }
});

// Register for webinar
app.post('/api/webinars/:id/register', authenticateToken, async (req, res) => {
  try {
    const webinarId = req.params.id;
    const studentId = req.user.id;

    const webinar = await WebinarModel.findOne({ id: webinarId });
    if (!webinar) {
      return res.status(404).json({ error: 'Webinar not found' });
    }

    // Check if student is already registered
    if (webinar.registeredStudents.includes(studentId)) {
      return res.status(409).json({ error: 'Already registered for this webinar' });
    }

    // Add student to registered list
    webinar.registeredStudents.push(studentId);
    await webinar.save();

    res.json({
      message: 'Successfully registered for webinar',
      webinarId,
      studentId
    });
  } catch (error) {
    console.error('Error registering for webinar:', error);
    res.status(500).json({ error: 'Failed to register for webinar' });
  }
});

// Join webinar endpoint
app.post('/api/webinars/:id/join', authenticateToken, async (req, res) => {
  try {
    const webinarId = req.params.id;
    const studentId = req.user.id;

    const webinar = await WebinarModel.findOne({ id: webinarId });
    if (!webinar) {
      return res.status(404).json({ error: 'Webinar not found' });
    }

    // Check if student is registered
    if (!webinar.registeredStudents.includes(studentId)) {
      return res.status(403).json({ error: 'Not registered for this webinar' });
    }

    // Record attendance (join time)
    const attendanceId = uuidv4();
    const attendance = new AttendanceModel({
      id: attendanceId,
      webinarId,
      studentId,
      joinTime: new Date(),
      status: 'joined'
    });
    await attendance.save();

    // Update webinar status to live if not already
    if (webinar.status === 'scheduled') {
      webinar.status = 'live';
      await webinar.save();
    }

    // Store in Redis for real-time tracking
    await redisClient.sAdd(`webinar:${webinarId}:participants`, studentId);
    await redisClient.set(`attendance:${attendanceId}`, JSON.stringify({
      id: attendanceId,
      webinarId,
      studentId,
      joinTime: attendance.joinTime.getTime()
    }), { EX: 86400 });

    res.json({
      attendanceId,
      webinarId,
      studentId,
      joinTime: attendance.joinTime,
      webinarTitle: webinar.title
    });
  } catch (error) {
    console.error('Error joining webinar:', error);
    res.status(500).json({ error: 'Failed to join webinar' });
  }
});

// Leave webinar endpoint
app.post('/api/webinars/:id/leave', authenticateToken, async (req, res) => {
  try {
    const webinarId = req.params.id;
    const studentId = req.user.id;

    // Find attendance record
    const attendance = await AttendanceModel.findOne({
      webinarId,
      studentId,
      status: 'joined'
    });

    if (attendance) {
      attendance.leaveTime = new Date();
      attendance.duration = Math.floor((attendance.leaveTime - attendance.joinTime) / (1000 * 60)); // in minutes
      attendance.status = 'left';
      await attendance.save();

      // Remove from Redis real-time tracking
      await redisClient.sRem(`webinar:${webinarId}:participants`, studentId);
    }

    res.json({
      message: 'Successfully left webinar',
      webinarId,
      studentId,
      leaveTime: attendance?.leaveTime
    });
  } catch (error) {
    console.error('Error leaving webinar:', error);
    res.status(500).json({ error: 'Failed to leave webinar' });
  }
});

// Get attendance records
app.get('/api/webinars/:id/attendance', authenticateToken, async (req, res) => {
  try {
    const webinarId = req.params.id;

    // Only allow admin or webinar creator to view attendance
    const webinar = await WebinarModel.findOne({ id: webinarId });
    if (!webinar) {
      return res.status(404).json({ error: 'Webinar not found' });
    }

    if (req.user.role !== 'admin' && webinar.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view attendance' });
    }

    const attendance = await AttendanceModel.find({ webinarId }).populate('studentId', 'name email');
    res.json(attendance);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
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

    // Get user data from MongoDB
    const user = await UserModel.findOne({ id: decoded.userId });
    if (!user) {
      console.log('User not found');
      socket.disconnect(true);
      return;
    }

    // Attach user data to socket
    socket.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    console.log(`User connected: ${socket.user.id} (${socket.user.name})`);

    let currentWebinarId = null;

  } catch (error) {
    console.error('Authentication error:', error);
    socket.disconnect(true);
    return;
  }

  // Join webinar room
  socket.on('join-webinar', async (data) => {
    try {
      const { webinarId } = data;
      const studentId = socket.user.id;

      const webinar = await WebinarModel.findOne({ id: webinarId });
      if (!webinar) {
        socket.emit('error', { message: 'Webinar not found' });
        return;
      }

      // Check if student is registered
      if (!webinar.registeredStudents.includes(studentId)) {
        socket.emit('error', { message: 'Not registered for this webinar' });
        return;
      }

      currentWebinarId = webinarId;

      // Join socket room
      socket.join(webinarId);

      // Add to Redis real-time participants
      await redisClient.sAdd(`webinar:${webinarId}:participants`, studentId);

      // Get current participants count
      const participantCount = await redisClient.sCard(`webinar:${webinarId}:participants`);

      // Notify all participants about new joiner
      socket.to(webinarId).emit('participant-joined', {
        studentId,
        studentName: socket.user.name,
        participantCount
      });

      // Send current webinar state to new participant
      socket.emit('webinar-joined', {
        webinar: {
          id: webinar.id,
          title: webinar.title,
          status: webinar.status,
          participantCount
        }
      });

    } catch (error) {
      console.error('Error joining webinar:', error);
      socket.emit('error', { message: 'Failed to join webinar' });
    }
  });

  // Handle chat messages
  socket.on('chat-message', async (data) => {
    try {
      if (!currentWebinarId) {
        socket.emit('error', { message: 'Not in a webinar' });
        return;
      }

      const { message } = data;
      if (!message || message.trim().length === 0) {
        return;
      }

      // Rate limiting for chat (10 messages per minute)
      const rateLimitKey = `rate:chat:${socket.user.id}`;
      let messageCount;
      try {
        messageCount = await redisClient.incr(rateLimitKey);
        if (messageCount === 1) {
          await redisClient.expire(rateLimitKey, 60);
        }
      } catch (redisError) {
        console.error('Redis rate limiting error:', redisError);
        messageCount = 1;
      }

      if (messageCount > 10) {
        socket.emit('error', { message: 'Chat rate limit exceeded' });
        return;
      }

      const chatMessage = {
        id: uuidv4(),
        webinarId: currentWebinarId,
        studentId: socket.user.id,
        studentName: socket.user.name,
        message: message.trim(),
        timestamp: Date.now(),
        role: socket.user.role
      };

      // Store in Redis for real-time chat
      await redisClient.lPush(`chat:${currentWebinarId}`, JSON.stringify(chatMessage));
      await redisClient.lTrim(`chat:${currentWebinarId}`, 0, 999); // Keep last 1000 messages

      // Broadcast to all participants
      io.to(currentWebinarId).emit('chat-message', chatMessage);

    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle presence tracking
  socket.on('presence-update', async (data) => {
    try {
      if (!currentWebinarId) return;

      const { status } = data; // 'online', 'away', 'offline'

      // Store presence in Redis
      await redisClient.set(`presence:${socket.user.id}`, JSON.stringify({
        webinarId: currentWebinarId,
        status,
        lastSeen: Date.now()
      }), { EX: 300 }); // 5 minutes

      // Broadcast presence update
      socket.to(currentWebinarId).emit('presence-update', {
        studentId: socket.user.id,
        studentName: socket.user.name,
        status
      });

    } catch (error) {
      console.error('Error updating presence:', error);
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    if (currentWebinarId) {
      // Remove from Redis real-time participants
      redisClient.sRem(`webinar:${currentWebinarId}:participants`, socket.user.id);

      // Update presence to offline
      redisClient.set(`presence:${socket.user.id}`, JSON.stringify({
        webinarId: currentWebinarId,
        status: 'offline',
        lastSeen: Date.now()
      }), { EX: 300 });

      // Notify others
      socket.to(currentWebinarId).emit('participant-left', {
        studentId: socket.user.id,
        studentName: socket.user.name
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
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: redisClient.isOpen ? 'connected' : 'disconnected'
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
    mongoose.connection.close();
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
    const existingUser = await UserModel.findOne({ email: adminEmail });
    if (existingUser) {
      console.log('✅ Default admin user already exists');
      return;
    }

    // Create admin user
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(adminPassword, SALT_ROUNDS);

    const newUser = new UserModel({
      id: userId,
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date()
    });

    await newUser.save();

    // Store in Redis
    await redisClient.set(`user:${userId}`, JSON.stringify({
      id: userId,
      name: adminName,
      email: adminEmail,
      role: 'admin',
      createdAt: newUser.createdAt.getTime()
    }), { EX: 86400 });

    await redisClient.set(`user:email:${adminEmail}`, userId, { EX: 86400 });
    await redisClient.set(`user:password:${userId}`, hashedPassword, { EX: 86400 });

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
  console.log(`🗄️ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
  console.log(`⚡ Redis: ${redisClient.isOpen ? 'Connected' : 'Disconnected'}`);
  console.log(`🎥 WebRTC signaling ready`);
  console.log(`💬 Socket.IO ready for ${process.env.NODE_ENV || 'development'} mode`);

  // Create default admin user
  await createDefaultAdminUser();
});

module.exports = { app, server, io, createDefaultAdminUser };

const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/webinar-platform', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('✅ Connected to MongoDB');

  // Define User schema to match the one in server.js
  const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: String,
    email: { type: String, required: true, unique: true },
    password: String,
    role: { type: String, enum: ['admin', 'student'], default: 'student' },
    createdAt: Date
  });

  const User = mongoose.model('User', userSchema);

  try {
    console.log('\n📋 DATA BEING SAVED ON MONGODB:');
    console.log('=====================================');

    // 1. USERS COLLECTION
    console.log('\n1. 👥 USERS COLLECTION');
    console.log('   Schema:');
    console.log('   - id: String (unique, required)');
    console.log('   - name: String');
    console.log('   - email: String (unique, required)');
    console.log('   - password: String (hashed)');
    console.log('   - role: String (admin/student)');
    console.log('   - createdAt: Date');

    const users = await User.find({});
    console.log(`   Current users: ${users.length}`);
    if (users.length > 0) {
      users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.name} (${user.email}) - ${user.role}`);
      });
    }

    // 2. WEBINARS COLLECTION
    console.log('\n2. 🎥 WEBINARS COLLECTION');
    console.log('   Schema:');
    console.log('   - id: String (unique, required)');
    console.log('   - title: String');
    console.log('   - hostId: String');
    console.log('   - hostName: String');
    console.log('   - maxParticipants: Number');
    console.log('   - settings: Object');
    console.log('   - createdAt: Date');
    console.log('   - isLive: Boolean');
    console.log('   - startTime: Date');
    console.log('   - endTime: Date');
    console.log('   - participants: [String]');
    console.log('   - presenters: [String]');
    console.log('   - moderators: [String]');

    // 3. PARTICIPANTS COLLECTION
    console.log('\n3. 👤 PARTICIPANTS COLLECTION');
    console.log('   Schema:');
    console.log('   - id: String (unique, required)');
    console.log('   - name: String');
    console.log('   - socketId: String');
    console.log('   - role: String');
    console.log('   - joinTime: Date');
    console.log('   - isAudioEnabled: Boolean');
    console.log('   - isVideoEnabled: Boolean');
    console.log('   - isScreenSharing: Boolean');
    console.log('   - currentWebinar: String');

    // 4. CHAT MESSAGES COLLECTION
    console.log('\n4. 💬 CHAT MESSAGES COLLECTION');
    console.log('   Schema:');
    console.log('   - id: String (unique, required)');
    console.log('   - webinarId: String');
    console.log('   - participantId: String');
    console.log('   - participantName: String');
    console.log('   - message: String');
    console.log('   - timestamp: Date');
    console.log('   - role: String');

    // Check all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📁 ALL COLLECTIONS IN DATABASE:');
    collections.forEach(col => {
      console.log(`- ${col.name}`);
    });

    console.log('\n🔄 CURRENTLY IMPLEMENTED:');
    console.log('✅ User registration saves to MongoDB');
    console.log('⚠️  Webinars currently save to Redis (can be updated to MongoDB)');
    console.log('⚠️  Participants currently in-memory (can be updated to MongoDB)');
    console.log('⚠️  Chat messages currently in Redis (can be updated to MongoDB)');

    console.log('\n💾 REDIS USAGE (Real-time/Cache):');
    console.log('- User sessions and authentication tokens');
    console.log('- Webinar participant counts');
    console.log('- Chat rate limiting');
    console.log('- Real-time presence tracking');

  } catch (error) {
    console.error('❌ Error querying database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  console.log('\n💡 Make sure MongoDB is running:');
  console.log('   - Start MongoDB service');
  console.log('   - Or run: mongod');
});

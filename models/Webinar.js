const mongoose = require('mongoose');

const webinarSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true,
    min: 15,
    max: 480 // 8 hours max
  },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended', 'cancelled'],
    default: 'scheduled'
  },
  roomId: {
    type: String,
    unique: true,
    required: true
  },
  maxParticipants: {
    type: Number,
    default: 100,
    min: 2,
    max: 1000
  },
  settings: {
    allowChat: { type: Boolean, default: true },
    allowReactions: { type: Boolean, default: true },
    allowScreenShare: { type: Boolean, default: false }, // only host by default
    allowRecording: { type: Boolean, default: true },
    waitingRoom: { type: Boolean, default: false },
    requireApproval: { type: Boolean, default: false }
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: Date,
    leftAt: Date,
    duration: Number, // in seconds
    role: {
      type: String,
      enum: ['host', 'presenter', 'attendee'],
      default: 'attendee'
    }
  }],
  recording: {
    isRecorded: { type: Boolean, default: false },
    filePath: String,
    fileSize: Number,
    duration: Number // in seconds
  },
  actualStartTime: Date,
  actualEndTime: Date,
  tags: [String],
  isPublic: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
webinarSchema.index({ host: 1, scheduledDate: -1 });
webinarSchema.index({ status: 1, scheduledDate: -1 });
webinarSchema.index({ roomId: 1 }, { unique: true });
webinarSchema.index({ scheduledDate: 1 });
webinarSchema.index({ tags: 1 });

// Virtual for computed fields
webinarSchema.virtual('isLive').get(function() {
  return this.status === 'live';
});

webinarSchema.virtual('participantCount').get(function() {
  return this.participants.filter(p => !p.leftAt).length;
});

// Methods
webinarSchema.methods.addParticipant = function(userId, role = 'attendee') {
  const existingParticipant = this.participants.find(p => 
    p.user.toString() === userId.toString() && !p.leftAt
  );
  
  if (existingParticipant) {
    return existingParticipant;
  }
  
  const participant = {
    user: userId,
    joinedAt: new Date(),
    role: role
  };
  
  this.participants.push(participant);
  return participant;
};

webinarSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString() && !p.leftAt
  );
  
  if (participant) {
    participant.leftAt = new Date();
    participant.duration = Math.floor((participant.leftAt - participant.joinedAt) / 1000);
  }
  
  return participant;
};

webinarSchema.methods.startWebinar = function() {
  this.status = 'live';
  this.actualStartTime = new Date();
  return this.save();
};

webinarSchema.methods.endWebinar = function() {
  this.status = 'ended';
  this.actualEndTime = new Date();
  
  // Update duration for active participants
  this.participants.forEach(participant => {
    if (!participant.leftAt) {
      participant.leftAt = new Date();
      participant.duration = Math.floor((participant.leftAt - participant.joinedAt) / 1000);
    }
  });
  
  return this.save();
};

// Static methods
webinarSchema.statics.findLiveWebinars = function() {
  return this.find({ status: 'live' }).populate('host', 'username firstName lastName');
};

webinarSchema.statics.findUpcomingWebinars = function(limit = 10) {
  return this.find({
    status: 'scheduled',
    scheduledDate: { $gte: new Date() }
  })
  .sort({ scheduledDate: 1 })
  .limit(limit)
  .populate('host', 'username firstName lastName');
};

module.exports = mongoose.model('Webinar', webinarSchema);
const mongoose = require('mongoose');

const webinarSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: String,
  scheduledDate: { type: Date, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  createdBy: { type: String, required: true }, // Admin ID
  status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
  maxParticipants: { type: Number, default: 500 },
  registeredStudents: [{ type: String }], // Array of student IDs
  settings: {
    allowRecording: { type: Boolean, default: true },
    requireRegistration: { type: Boolean, default: true },
    enableChat: { type: Boolean, default: true },
    enableQandA: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for faster queries
webinarSchema.index({ createdBy: 1 });
webinarSchema.index({ status: 1 });
webinarSchema.index({ scheduledDate: 1 });

module.exports = mongoose.model('Webinar', webinarSchema);

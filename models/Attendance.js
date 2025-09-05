const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  webinarId: { type: String, required: true },
  studentId: { type: String, required: true },
  joinTime: { type: Date, required: true },
  leaveTime: Date,
  duration: Number, // in minutes
  status: { type: String, enum: ['joined', 'left'], default: 'joined' },
  createdAt: { type: Date, default: Date.now }
});

// Index for faster queries
attendanceSchema.index({ webinarId: 1, studentId: 1 });
attendanceSchema.index({ studentId: 1 });
attendanceSchema.index({ joinTime: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);

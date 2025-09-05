const mongoose = require('mongoose');

const recordingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  webinarId: { type: String, required: true },
  url: { type: String, required: true },
  metadata: {
    duration: Number, // in seconds
    size: Number, // in bytes
    format: String,
    createdAt: { type: Date, default: Date.now }
  },
  createdAt: { type: Date, default: Date.now }
});

// Index for faster queries
recordingSchema.index({ webinarId: 1 });
recordingSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Recording', recordingSchema);

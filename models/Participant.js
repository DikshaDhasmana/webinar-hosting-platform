class Participant {
  constructor(id, name, socketId = null, role = 'attendee') {
    this.id = id;
    this.name = name;
    this.socketId = socketId;
    this.role = role;
    this.joinTime = Date.now();
    this.isAudioEnabled = true;
    this.isVideoEnabled = true;
    this.isScreenSharing = false;
    this.currentWebinar = null;
  }

  // Update participant status
  updateStatus(audioEnabled = null, videoEnabled = null, screenSharing = null) {
    if (audioEnabled !== null) this.isAudioEnabled = audioEnabled;
    if (videoEnabled !== null) this.isVideoEnabled = videoEnabled;
    if (screenSharing !== null) this.isScreenSharing = screenSharing;
  }

  // Get participant info for client
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      isAudioEnabled: this.isAudioEnabled,
      isVideoEnabled: this.isVideoEnabled,
      isScreenSharing: this.isScreenSharing,
      joinTime: this.joinTime
    };
  }

  // Check if participant can speak (host, presenter, moderator)
  canSpeak() {
    return ['host', 'presenter', 'moderator'].includes(this.role);
  }
}

module.exports = Participant;

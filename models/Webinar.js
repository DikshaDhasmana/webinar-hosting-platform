// Webinar class for in-memory operations
class Webinar {
  constructor(id, title, hostId, maxParticipants) {
    this.id = id;
    this.title = title;
    this.hostId = hostId;
    this.hostName = '';
    this.maxParticipants = maxParticipants;
    this.settings = {};
    this.createdAt = new Date();
    this.isLive = false;
    this.startTime = null;
    this.endTime = null;
    this.participants = new Set();
    this.presenters = new Set();
    this.moderators = new Set();
  }

  addParticipant(participantId, role = 'attendee') {
    if (this.participants.size >= this.maxParticipants) {
      throw new Error('Webinar is at maximum capacity');
    }
    this.participants.add(participantId);
    if (role === 'presenter') {
      this.presenters.add(participantId);
    } else if (role === 'moderator') {
      this.moderators.add(participantId);
    }
  }

  removeParticipant(participantId) {
    this.participants.delete(participantId);
    this.presenters.delete(participantId);
    this.moderators.delete(participantId);
  }

  canUserSpeak(participantId) {
    return this.presenters.has(participantId) ||
           this.moderators.has(participantId) ||
           this.hostId === participantId;
  }

  getStats() {
    return {
      id: this.id,
      title: this.title,
      hostId: this.hostId,
      hostName: this.hostName,
      maxParticipants: this.maxParticipants,
      settings: this.settings,
      createdAt: this.createdAt,
      isLive: this.isLive,
      startTime: this.startTime,
      endTime: this.endTime,
      participantCount: this.participants.size,
      participants: Array.from(this.participants),
      presenters: Array.from(this.presenters),
      moderators: Array.from(this.moderators)
    };
  }
}

module.exports = Webinar;

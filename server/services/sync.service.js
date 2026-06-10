const Message = require('../models/message.model');
const Presence = require('./presence.service');

class SyncService {
  static async syncOfflineMessages(io, userId) {
    const messages = await Message.findUndelivered(userId);
    const socketId = await Presence.getSocket(userId);

    if (socketId && messages.length) {
      io.to(socketId).emit('offline_messages', messages);
    }

    return messages.length;
  }
}

module.exports = SyncService;

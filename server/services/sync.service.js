const Message = require('../models/message.model');
const Presence = require('./presence.service');

class SyncService {
  static async syncOfflineMessages(io, userId) {
    const messages = await Message.findUndelivered(userId);
    const socketId = await Presence.getSocket(userId);

    if (socketId && messages.length) {
      io.to(socketId).emit('offline_messages', messages);

      // Mark all synced messages as delivered to prevent re-sending on next connect
      const messageIds = messages.map(m => m.id);
      await Message.markManyDelivered(messageIds);
    }

    return messages.length;
  }
}

module.exports = SyncService;

const Message = require('../models/message.model');
const Presence = require('./presence.service');

class SyncService {
  static async syncOfflineMessages(io, userId) {
    const messages = await Message.findUndelivered(userId);

    if (!messages.length) return 0;

    // Emit to the user's personal room (works even after socket reconnect with new socketId)
    io.to(`user:${userId}`).emit('offline_messages', messages);

    // Mark all synced messages as delivered to prevent re-sending on next connect
    // messages are normalized: use messageId (mapped from db 'id')
    const messageIds = messages.map(m => m.messageId);
    await Message.markManyDelivered(messageIds);

    return messages.length;
  }
}

module.exports = SyncService;

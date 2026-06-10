const Presence = require('../services/presence.service');
const ChatService = require('../modules/chat/chat.service');
const SyncService = require('../services/sync.service');

module.exports = (io, socket) => {
  const userId = socket.user.id;

  // ── Online presence ──────────────────────────────────────────────────────────
  Presence.online(userId, socket.id);

  // Notify contacts this user is online (optional — clients subscribe to this)
  socket.broadcast.emit('user_online', { userId });

  // ── Messaging ────────────────────────────────────────────────────────────────
  socket.on('send_message', (data) => ChatService.sendMessage(io, socket, data));
  socket.on('message_delivered', (data) => ChatService.markDelivered(io, socket, data));
  socket.on('message_read', (data) => ChatService.markRead(io, socket, data));
  socket.on('typing', (data) => ChatService.typing(io, socket, data));

  // ── Offline sync ─────────────────────────────────────────────────────────────
  socket.on('sync_messages', () => SyncService.syncOfflineMessages(io, userId));

  // Auto-sync on connect
  SyncService.syncOfflineMessages(io, userId);

  // ── Groups ───────────────────────────────────────────────────────────────────
  socket.on('join_group', (groupId) => {
    socket.join('group:' + groupId);
    socket.emit('joined_group', { groupId });
  });

  socket.on('leave_group', (groupId) => {
    socket.leave('group:' + groupId);
    socket.emit('left_group', { groupId });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} user=${userId} reason=${reason}`);
    Presence.offline(userId);
    socket.broadcast.emit('user_offline', { userId });
  });

  // ── Error guard ──────────────────────────────────────────────────────────────
  socket.on('error', (err) => {
    console.error(`[socket] error user=${userId}`, err);
  });
};

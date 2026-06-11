const Presence = require('../services/presence.service');
const ChatService = require('../modules/chat/chat.service');
const SyncService = require('../services/sync.service');
const pool = require('../config/db');

/**
 * Fetch all group IDs that a user is a member of.
 * Used to auto-join group rooms on connect/reconnect.
 */
async function getUserGroupIds(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT group_id::text FROM group_members WHERE user_id = $1::uuid`,
      [userId]
    );
    return rows.map(r => r.group_id);
  } catch (err) {
    console.error('[socket] failed to fetch user groups', err);
    return [];
  }
}

module.exports = (io, socket) => {
  const userId = socket.user.id;

  // ── Personal user room ───────────────────────────────────────────────────────
  // ISSUE 2,3,4,5 FIX: Join a personal room on every connect/reconnect.
  // This room persists message delivery and typing events regardless of socketId.
  // All DM delivery, typing, and cross-conversation notifications target this room.
  socket.join(`user:${userId}`);

  // ── Online presence ──────────────────────────────────────────────────────────
  Presence.online(userId, socket.id);

  // Notify all others that this user is online
  socket.broadcast.emit('user_online', { userId });

  // Send current online user list to the newly connected socket
  Presence.getOnlineUsers().then(onlineList => {
    socket.emit('online_users_snapshot', { userIds: onlineList });
  }).catch(err => console.error('[socket] failed to get online users', err));

  // ── Auto-join all group rooms ─────────────────────────────────────────────────
  // ISSUE 2,3 FIX: Immediately rejoin all group rooms the user belongs to.
  // This happens on every connect (including after page refresh or network reconnect)
  // so the user never misses group messages without manual rejoin.
  getUserGroupIds(userId).then(groupIds => {
    groupIds.forEach(gid => {
      socket.join('group:' + gid);
    });
    if (groupIds.length) {
      console.log(`[socket] user=${userId} auto-joined ${groupIds.length} group room(s)`);
    }
  });

  // ── Messaging ────────────────────────────────────────────────────────────────
  socket.on('send_message', (data) => ChatService.sendMessage(io, socket, data));
  socket.on('message_delivered', (data) => ChatService.markDelivered(io, socket, data));
  socket.on('message_read', (data) => ChatService.markRead(io, socket, data));
  socket.on('typing', (data) => ChatService.typing(io, socket, data));

  // ISSUE 7: Delete message via socket
  socket.on('delete_message', (data) => ChatService.deleteMessage(io, socket, data));

  // ── Offline sync ─────────────────────────────────────────────────────────────
  socket.on('sync_messages', () => SyncService.syncOfflineMessages(io, userId));

  // Auto-sync on connect (covers offline messages received while disconnected)
  SyncService.syncOfflineMessages(io, userId);

  // ── Groups (explicit join/leave for conversations the user opens) ─────────────
  // Note: on connect, all groups are already auto-joined above.
  // These events are kept for explicit UI actions (e.g. entering a group chat).
  socket.on('join_group', (groupId) => {
    if (!groupId) return;
    socket.join('group:' + groupId);
    socket.emit('joined_group', { groupId });
  });

  socket.on('leave_group', (groupId) => {
    if (!groupId) return;
    socket.leave('group:' + groupId);
    socket.emit('left_group', { groupId });
  });

  // ISSUE 9 FIX: handle client requesting explicit rejoin of all groups
  // (fired by client onConnect handler as a belt-and-suspenders measure)
  socket.on('join_all_groups', async () => {
    const groupIds = await getUserGroupIds(userId);
    groupIds.forEach(gid => socket.join('group:' + gid));
    socket.emit('all_groups_joined', { count: groupIds.length });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} user=${userId} reason=${reason}`);
    // Only mark offline if this was the last socket for this user
    // (handles multiple tabs: use presence TTL in Redis)
    Presence.offline(userId);
    socket.broadcast.emit('user_offline', { userId });
  });

  // ── Error guard ──────────────────────────────────────────────────────────────
  socket.on('error', (err) => {
    console.error(`[socket] error user=${userId}`, err);
  });
};

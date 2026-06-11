const { v4: uuidv4 } = require('uuid');
const Presence = require('../../services/presence.service');
const Queue = require('./chat.queue');
const Message = require('../../models/message.model');

class ChatService {

  static async sendMessage(io, socket, data) {
    const msg = {
      messageId:   uuidv4(),
      senderId:    socket.user?.id,
      receiverId:  data.receiverId || null,
      groupId:     data.groupId   || null,
      content:     data.content,
      messageType: data.type || 'private',   // 'private' | 'group'
      type:        data.type || 'private',
      status:      'sent',
      sender_username: socket.user?.username || null,
      createdAt:   new Date().toISOString()
    };

    if (msg.messageType === 'private') {
      // ISSUE 5 FIX: Emit to user's personal room instead of a specific socketId.
      // This survives reconnects because the user always re-joins user:{userId} on connect.
      io.to(`user:${msg.receiverId}`).emit('receive_message', msg);

      // Optimistically mark as delivered since receiver is in their personal room (likely online)
      // The actual delivery confirmation comes when receiver emits message_delivered
      const receiverOnline = await Presence.isOnline(msg.receiverId);
      if (receiverOnline) {
        io.to(socket.id).emit('message_status_update', {
          messageId: msg.messageId,
          status: 'delivered'
        });
      }
    }

    if (msg.messageType === 'group') {
      // Broadcast to all group members except sender
      socket.to('group:' + msg.groupId).emit('receive_message', msg);
    }

    // Enqueue for async DB persistence
    await Queue.publish({
      event:       'new_message',
      messageType: msg.messageType,
      messageId:   msg.messageId,
      senderId:    msg.senderId,
      receiverId:  msg.receiverId,
      groupId:     msg.groupId,
      content:     msg.content,
      status:      msg.status,
      createdAt:   msg.createdAt
    });

    // Ack back to sender with full message object
    socket.emit('message_sent', { messageId: msg.messageId, status: msg.status, msg });
  }

  static async markDelivered(io, socket, data) {
    const senderSocket = await Presence.getSocket(data.senderId);
    if (senderSocket) {
      io.to(senderSocket).emit('message_status_update', {
        messageId: data.messageId,
        status: 'delivered'
      });
    }
    await Queue.publish({ event: 'status_update', messageId: data.messageId, status: 'delivered' });
  }

  static async markRead(io, socket, data) {
    const senderSocket = await Presence.getSocket(data.senderId);
    if (senderSocket) {
      io.to(senderSocket).emit('message_status_update', {
        messageId: data.messageId,
        status: 'read'
      });
    }
    await Queue.publish({ event: 'status_update', messageId: data.messageId, status: 'read' });
  }

  static async typing(io, socket, data) {
    if (data.groupId) {
      socket.to('group:' + data.groupId).emit('typing', {
        senderId: socket.user?.id,
        groupId: data.groupId,
        isTyping: data.isTyping ?? true
      });
    } else if (data.receiverId) {
      // ISSUE 4 FIX: emit to user room — works after reconnect
      io.to(`user:${data.receiverId}`).emit('typing', {
        senderId: socket.user?.id,
        isTyping: data.isTyping ?? true
      });
    }
  }

  /**
   * ISSUE 7: Delete a message.
   * Only the original sender can delete their message.
   * Broadcasts a message_deleted event to all conversation participants.
   */
  static async deleteMessage(io, socket, data) {
    const { messageId } = data;
    if (!messageId) return;

    // Get meta before deleting so we know who to notify
    const meta = await Message.getMessageMeta(messageId);
    if (!meta) {
      socket.emit('error_response', { event: 'delete_message', error: 'Message not found' });
      return;
    }

    // Authorization: only sender can delete
    if (meta.sender_id !== socket.user?.id) {
      socket.emit('error_response', { event: 'delete_message', error: 'Not authorized' });
      return;
    }

    const deleted = await Message.softDelete(messageId, socket.user.id);
    if (!deleted) {
      socket.emit('error_response', { event: 'delete_message', error: 'Delete failed' });
      return;
    }

    const payload = { messageId, deletedAt: deleted.deleted_at };

    if (meta.type === 'private') {
      // Notify both sender and receiver
      socket.emit('message_deleted', payload);
      io.to(`user:${meta.receiver_id}`).emit('message_deleted', payload);
    } else if (meta.type === 'group') {
      // Notify all group members including sender
      socket.emit('message_deleted', payload);
      socket.to('group:' + meta.group_id).emit('message_deleted', payload);
    }
  }
}

module.exports = ChatService;

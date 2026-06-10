const { v4: uuidv4 } = require('uuid');
const Presence = require('../../services/presence.service');
const Queue = require('./chat.queue');

class ChatService {

  static async sendMessage(io, socket, data) {
    const msg = {
      messageId: uuidv4(),
      senderId: socket.user?.id,
      receiverId: data.receiverId || null,
      groupId:   data.groupId   || null,
      content:   data.content,
      messageType: data.type || 'private',   // 'private' | 'group'
      status: 'sent',
      createdAt: new Date().toISOString()
    };

    if (msg.messageType === 'private') {
      const socketId = await Presence.getSocket(msg.receiverId);

      if (socketId) {
        io.to(socketId).emit('receive_message', msg);
        // Optimistically mark as delivered since receiver is online
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
    // IMPORTANT: use 'event' field separate from message 'messageType' to avoid collision
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

    // Ack back to sender
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
      const targetSocket = await Presence.getSocket(data.receiverId);
      if (targetSocket) {
        io.to(targetSocket).emit('typing', {
          senderId: socket.user?.id,
          isTyping: data.isTyping ?? true
        });
      }
    }
  }
}

module.exports = ChatService;

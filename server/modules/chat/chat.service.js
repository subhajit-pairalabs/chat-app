const { v4: uuidv4 } = require('uuid');
const Presence = require('../../services/presence.service');
const Queue = require('./chat.queue');

class ChatService {

  static async sendMessage(io, socket, data) {
    const msg = {
      messageId: uuidv4(),
      senderId: socket.user?.id || data.senderId,
      ...data,
      status: 'sent',
      createdAt: new Date().toISOString()
    };

    if (data.type === 'private') {
      const socketId = await Presence.getSocket(data.receiverId);

      if (socketId) {
        io.to(socketId).emit('receive_message', msg);
        // Optimistically emit delivered since receiver is online
        io.to(socket.id).emit('message_status_update', {
          messageId: msg.messageId,
          status: 'delivered'
        });
      }
    }

    if (data.type === 'group') {
      // Broadcast to all group members except sender
      socket.to('group:' + data.groupId).emit('receive_message', msg);
    }

    // Enqueue for async DB persistence
    await Queue.publish({ type: 'new_message', ...msg });

    // Ack back to sender
    socket.emit('message_sent', { messageId: msg.messageId, status: msg.status });
  }

  static async markDelivered(io, socket, data) {
    const senderSocket = await Presence.getSocket(data.senderId);
    if (senderSocket) {
      io.to(senderSocket).emit('message_status_update', {
        messageId: data.messageId,
        status: 'delivered'
      });
    }
    await Queue.publish({ type: 'status_update', ...data, status: 'delivered' });
  }

  static async markRead(io, socket, data) {
    const senderSocket = await Presence.getSocket(data.senderId);
    if (senderSocket) {
      io.to(senderSocket).emit('message_status_update', {
        messageId: data.messageId,
        status: 'read'
      });
    }
    await Queue.publish({ type: 'status_update', ...data, status: 'read' });
  }

  static async typing(io, socket, data) {
    const targetSocket = data.groupId
      ? null // broadcast handled below
      : await Presence.getSocket(data.receiverId);

    if (data.groupId) {
      socket.to('group:' + data.groupId).emit('typing', {
        senderId: socket.user?.id || data.senderId,
        groupId: data.groupId,
        isTyping: data.isTyping ?? true
      });
    } else if (targetSocket) {
      io.to(targetSocket).emit('typing', {
        senderId: socket.user?.id || data.senderId,
        isTyping: data.isTyping ?? true
      });
    }
  }
}

module.exports = ChatService;

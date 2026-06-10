const Message = require('../models/message.model');
const { v4: uuidv4 } = require('uuid');
const { publish, QUEUES } = require('../config/rabbitmq');

/**
 * GET /api/messages/conversation/:userId
 * Fetch paginated message history between authenticated user and :userId
 */
async function getConversationMessages(req, res, next) {
  try {
    const { userId } = req.params;
    const { limit = 50, before } = req.query;

    const messages = await Message.findByConversation(
      req.user.id,
      userId,
      { limit: parseInt(limit), before }
    );

    res.json({ data: messages, count: messages.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/messages/group/:groupId
 * Fetch paginated message history for a group
 */
async function getGroupMessages(req, res, next) {
  try {
    const { groupId } = req.params;
    const { limit = 50, before } = req.query;

    const messages = await Message.findByGroup(groupId, { limit: parseInt(limit), before });
    res.json({ data: messages, count: messages.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/messages
 * Send a message via REST (non-realtime fallback; also enqueues for persistence)
 */
async function sendMessage(req, res, next) {
  try {
    const { receiverId, groupId, content, type = 'private' } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }
    if (type === 'private' && !receiverId) {
      return res.status(400).json({ error: 'receiverId is required for private messages' });
    }
    if (type === 'group' && !groupId) {
      return res.status(400).json({ error: 'groupId is required for group messages' });
    }

    const messageId = uuidv4();
    const payload = {
      event:       'new_message',  // routing key for worker
      messageType: type,           // 'private' | 'group'
      messageId,
      senderId:    req.user.id,
      receiverId:  receiverId || null,
      groupId:     groupId || null,
      content:     content.trim(),
      status:      'sent'
    };

    // Enqueue for async persistence
    await publish(QUEUES.CHAT, payload);

    res.status(202).json({ messageId, status: 'queued' });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/messages/:messageId/status
 * Update message read/delivered status
 */
async function updateMessageStatus(req, res, next) {
  try {
    const { messageId } = req.params;
    const { status } = req.body;

    if (!['delivered', 'read'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "delivered" or "read"' });
    }

    const updated = await Message.updateStatus(messageId, status);
    if (!updated) return res.status(404).json({ error: 'Message not found' });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/messages/:messageId
 * Soft-delete a message (only sender can delete)
 */
async function deleteMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const deleted = await Message.softDelete(messageId, req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Message not found or not owned by you' });
    }

    res.json({ message: 'Message deleted' });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/messages/read/:senderId
 * Mark all messages from :senderId to authenticated user as read
 */
async function markConversationRead(req, res, next) {
  try {
    const { senderId } = req.params;
    const count = await Message.markConversationRead(req.user.id, senderId);
    res.json({ updated: count });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getConversationMessages,
  getGroupMessages,
  sendMessage,
  updateMessageStatus,
  deleteMessage,
  markConversationRead
};

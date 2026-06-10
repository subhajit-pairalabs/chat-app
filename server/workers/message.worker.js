require('dotenv').config();
const { getChannel, QUEUES } = require('../config/rabbitmq');
const Message = require('../models/message.model');

async function start() {
  const ch = await getChannel();
  ch.prefetch(10); // Process up to 10 messages concurrently

  ch.consume(QUEUES.CHAT, async (msg) => {
    if (!msg) return;

    let data;
    try {
      data = JSON.parse(msg.content.toString());
    } catch {
      console.error('[worker] malformed message — discarding');
      ch.nack(msg, false, false); // dead-letter, don't requeue
      return;
    }

    try {
      if (data.type === 'new_message') {
        await Message.create({
          messageId: data.messageId,
          senderId:  data.senderId,
          receiverId: data.receiverId || null,
          groupId:   data.groupId || null,
          content:   data.content || data.message,
          type:      data.type === 'new_message' ? (data.messageType || 'private') : data.type,
          status:    data.status || 'sent'
        });
        console.log(`[worker] saved message ${data.messageId}`);
      }

      if (data.type === 'status_update') {
        await Message.updateStatus(data.messageId, data.status);
        console.log(`[worker] updated status ${data.messageId} → ${data.status}`);
      }

      ch.ack(msg);
    } catch (err) {
      console.error('[worker] error processing message:', err.message);
      // Requeue once on transient errors (e.g. DB unavailable)
      const requeued = !msg.fields.redelivered;
      ch.nack(msg, false, requeued);
    }
  });

  console.log('[worker] listening on', QUEUES.CHAT);
}

start().catch((err) => {
  console.error('[worker] fatal startup error:', err);
  process.exit(1);
});

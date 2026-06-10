const amqp = require('amqplib');

const QUEUES = {
  CHAT: 'chat.queue',
  NOTIFICATIONS: 'notifications.queue'
};

let connection = null;
let channel = null;

async function connect() {
  if (channel) return channel;

  connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
  channel = await connection.createChannel();

  // Assert all queues at startup
  for (const q of Object.values(QUEUES)) {
    await channel.assertQueue(q, { durable: true });
  }

  connection.on('error', (err) => {
    console.error('[rabbitmq] connection error', err);
    channel = null;
    connection = null;
  });

  connection.on('close', () => {
    console.warn('[rabbitmq] connection closed, will reconnect on next use');
    channel = null;
    connection = null;
  });

  console.log('[rabbitmq] connected');
  return channel;
}

async function getChannel() {
  if (!channel) await connect();
  return channel;
}

async function publish(queue, data) {
  const ch = await getChannel();
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(data)), { persistent: true });
}

async function close() {
  if (connection) await connection.close();
}

module.exports = { connect, getChannel, publish, close, QUEUES };

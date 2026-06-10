const { createClient } = require('redis');

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.error('[redis] client error', err));
client.on('connect', () => console.log('[redis] connected'));

client.connect();

module.exports = client;

const { Server } = require('socket.io');
const { authenticateSocket } = require('../middleware/auth.middleware');
const registerEvents = require('./socket.events');

module.exports = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authenticate every socket connection
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id} user=${socket.user.id}`);
    registerEvents(io, socket);
  });

  return io;
};

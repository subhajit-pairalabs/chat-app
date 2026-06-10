import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  return socket;
}

export function connectSocket(token) {
  if (socket?.connected) return socket;

  // Disconnect any stale socket before creating a new one
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io('/', {
    auth: { token },
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('[socket] connected', socket.id);
    // Sync messages on every reconnect (handles reconnects after network drop)
    socket.emit('sync_messages');
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] connect error', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] disconnected', reason);
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

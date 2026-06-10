# Chat System — Production Setup

## Architecture

```
Client (React + Socket.IO)
        │
        ▼
Express HTTP API  ──►  PostgreSQL (persistent storage)
Socket.IO Server  ──►  Redis (presence / socket mapping)
        │
        ▼
RabbitMQ (chat.queue)
        │
        ▼
Message Worker (async DB writes)
```

## Prerequisites

- Node.js ≥ 18
- PostgreSQL ≥ 14
- Redis ≥ 7
- RabbitMQ ≥ 3.12

## Quick Start

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your DB / Redis / RabbitMQ credentials and a strong JWT_SECRET
```

### 3. Run database migrations

```bash
psql -U postgres -d chatdb -f migrations/001_init.sql
```

### 4. Start the API server

```bash
npm start
# or for development with hot-reload:
npm run dev
```

### 5. Start the message worker (separate process)

```bash
npm run worker
```

---

## REST API Reference

All endpoints (except `/health`, `/api/auth/register`, `/api/auth/login`) require:

```
Authorization: Bearer <jwt_token>
```

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |

### Messages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/messages/conversation/:userId` | DM history (paginated) |
| GET | `/api/messages/group/:groupId` | Group history (paginated) |
| POST | `/api/messages` | Send message (REST fallback) |
| PATCH | `/api/messages/:id/status` | Update status (delivered/read) |
| PATCH | `/api/messages/read/:senderId` | Bulk mark conversation as read |
| DELETE | `/api/messages/:id` | Soft-delete own message |

Query params for history endpoints: `?limit=50&before=<ISO timestamp>`

### Conversations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conversations` | List all conversations |
| POST | `/api/conversations/group` | Create group |
| GET | `/api/conversations/group/:id` | Group details + members |
| POST | `/api/conversations/group/:id/members` | Add member |
| DELETE | `/api/conversations/group/:id/members/:userId` | Remove member / leave |

---

## WebSocket Events

Connect with a JWT token:

```js
const socket = io('http://localhost:3000', {
  auth: { token: '<jwt_token>' }
});
```

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `send_message` | `{ type, senderId, receiverId?, groupId?, content }` | Send a message |
| `message_delivered` | `{ messageId, senderId }` | Confirm delivery |
| `message_read` | `{ messageId, senderId }` | Confirm read |
| `typing` | `{ receiverId?, groupId?, isTyping }` | Typing indicator |
| `join_group` | `groupId` | Join a group room |
| `leave_group` | `groupId` | Leave a group room |
| `sync_messages` | — | Request offline message sync |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `receive_message` | Message object | New incoming message |
| `message_sent` | `{ messageId, status }` | Ack to sender |
| `message_status_update` | `{ messageId, status }` | Delivery / read receipt |
| `offline_messages` | Message[] | Missed messages on connect |
| `typing` | `{ senderId, isTyping }` | Typing indicator |
| `user_online` | `{ userId }` | Contact came online |
| `user_offline` | `{ userId }` | Contact went offline |

---

## Production Checklist

- [ ] Set a strong `JWT_SECRET` (≥ 32 random bytes)
- [ ] Use TLS (HTTPS + WSS) in front of this server
- [ ] Set `CORS_ORIGIN` to your frontend domain
- [ ] Use connection pooling for PostgreSQL (`max: 20` is set by default)
- [ ] Run the worker as a separate process / container
- [ ] Configure RabbitMQ with a dead-letter exchange for failed messages
- [ ] Set up Redis persistence (AOF or RDB snapshots)
- [ ] Add a process manager (PM2 / systemd / Docker)

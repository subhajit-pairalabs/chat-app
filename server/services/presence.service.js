const redis = require('../config/redis');

const ONLINE_KEY = 'online_users';
const SOCKET_TTL = 60 * 60 * 24; // 24h — survive brief Redis restarts

class Presence {
  static async online(userId, socketId) {
    await Promise.all([
      redis.set(`user:${userId}`, socketId, { EX: SOCKET_TTL }),
      redis.sAdd(ONLINE_KEY, String(userId))
    ]);
  }

  static async getSocket(userId) {
    return redis.get(`user:${userId}`);
  }

  static async offline(userId) {
    await Promise.all([
      redis.del(`user:${userId}`),
      redis.sRem(ONLINE_KEY, String(userId))
    ]);
  }

  static async isOnline(userId) {
    return redis.sIsMember(ONLINE_KEY, String(userId));
  }

  static async getOnlineUsers() {
    return redis.sMembers(ONLINE_KEY);
  }
}

module.exports = Presence;

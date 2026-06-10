const pool = require('../config/db');

class Message {
  /**
   * Persist a single message row.
   */
  static async create({ messageId, senderId, receiverId, groupId, content, type, status }) {
    const { rows } = await pool.query(
      `INSERT INTO messages (id, sender_id, receiver_id, group_id, content, type, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [messageId, senderId, receiverId || null, groupId || null, content, type, status]
    );
    return rows[0];
  }

  /**
   * Fetch a message by its primary key.
   */
  static async findById(id) {
    const { rows } = await pool.query('SELECT * FROM messages WHERE id = $1', [id]);
    return rows[0] || null;
  }

  /**
   * All messages in a private conversation between two users, paginated.
   */
  static async findByConversation(userA, userB, { limit = 50, before } = {}) {
    const params = [userA, userB, limit];
    let cursor = '';
    if (before) {
      params.push(before);
      cursor = `AND m.created_at < $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT * FROM messages m
       WHERE type = 'private'
         AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
         ${cursor}
       ORDER BY created_at DESC
       LIMIT $3`,
      params
    );
    return rows.reverse();
  }

  /**
   * All messages in a group, paginated.
   */
  static async findByGroup(groupId, { limit = 50, before } = {}) {
    const params = [groupId, limit];
    let cursor = '';
    if (before) {
      params.push(before);
      cursor = `AND created_at < $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT * FROM messages
       WHERE group_id = $1 ${cursor}
       ORDER BY created_at DESC
       LIMIT $2`,
      params
    );
    return rows.reverse();
  }

  /**
   * Undelivered messages for a user (used on reconnect sync).
   */
  static async findUndelivered(userId) {
    const { rows } = await pool.query(
      `SELECT * FROM messages
       WHERE receiver_id = $1 AND status != 'read'
       ORDER BY created_at ASC`,
      [userId]
    );
    return rows;
  }

  /**
   * Update delivery status.
   */
  static async updateStatus(messageId, status) {
    const { rows } = await pool.query(
      `UPDATE messages SET status = $1 WHERE id = $2 RETURNING *`,
      [status, messageId]
    );
    return rows[0] || null;
  }

  /**
   * Bulk mark a conversation as read.
   */
  static async markConversationRead(receiverId, senderId) {
    const { rowCount } = await pool.query(
      `UPDATE messages SET status = 'read'
       WHERE receiver_id = $1 AND sender_id = $2 AND status != 'read'`,
      [receiverId, senderId]
    );
    return rowCount;
  }

  /**
   * Soft-delete (sets deleted_at). Hard delete is not exposed.
   */
  static async softDelete(messageId, requesterId) {
    const { rows } = await pool.query(
      `UPDATE messages SET deleted_at = NOW()
       WHERE id = $1 AND sender_id = $2
       RETURNING *`,
      [messageId, requesterId]
    );
    return rows[0] || null;
  }
}

module.exports = Message;

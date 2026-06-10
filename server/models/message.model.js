const pool = require('../config/db');

class Message {
  /**
   * Persist a single message row.
   */
  static async create({ messageId, senderId, receiverId, groupId, content, type, status }) {
    const { rows } = await pool.query(
      `INSERT INTO messages (id, sender_id, receiver_id, group_id, content, type, status, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, NOW())
       RETURNING *`,
      [messageId, senderId, receiverId || null, groupId || null, content, type, status]
    );
    return rows[0];
  }

  /**
   * Fetch a message by its primary key.
   */
  static async findById(id) {
    const { rows } = await pool.query(
      `SELECT m.*, u.username AS sender_username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.id = $1::uuid AND m.deleted_at IS NULL`,
      [id]
    );
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
      `SELECT m.*, u.username AS sender_username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.type = 'private'
         AND m.deleted_at IS NULL
         AND ((m.sender_id = $1::uuid AND m.receiver_id = $2::uuid)
               OR (m.sender_id = $2::uuid AND m.receiver_id = $1::uuid))
         ${cursor}
       ORDER BY m.created_at DESC
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
      cursor = `AND m.created_at < $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT m.*, u.username AS sender_username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.group_id = $1::uuid
         AND m.deleted_at IS NULL
         ${cursor}
       ORDER BY m.created_at DESC
       LIMIT $2`,
      params
    );
    return rows.reverse();
  }

  /**
   * Undelivered messages for a user (used on reconnect sync).
   * Only fetches status='sent' to avoid re-delivering already delivered messages.
   * Also fetches missed group messages.
   */
  static async findUndelivered(userId) {
    const { rows } = await pool.query(
      `SELECT m.*, u.username AS sender_username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.deleted_at IS NULL
         AND (
           -- Private messages sent to this user that haven't been delivered
           (m.receiver_id = $1::uuid AND m.status = 'sent')
           OR
           -- Group messages this user hasn't seen (they were offline)
           (
             m.group_id IN (
               SELECT group_id FROM group_members WHERE user_id = $1::uuid
             )
             AND m.status = 'sent'
             AND m.sender_id != $1::uuid
           )
         )
       ORDER BY m.created_at ASC`,
      [userId]
    );
    return rows;
  }

  /**
   * Update delivery status.
   */
  static async updateStatus(messageId, status) {
    const { rows } = await pool.query(
      `UPDATE messages SET status = $1 WHERE id = $2::uuid RETURNING *`,
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
       WHERE receiver_id = $1::uuid AND sender_id = $2::uuid AND status != 'read'`,
      [receiverId, senderId]
    );
    return rowCount;
  }

  /**
   * Bulk mark all delivered messages for a user as delivered (used after offline sync).
   */
  static async markManyDelivered(messageIds) {
    if (!messageIds.length) return;
    const { rowCount } = await pool.query(
      `UPDATE messages SET status = 'delivered'
       WHERE id = ANY($1::uuid[]) AND status = 'sent'`,
      [messageIds]
    );
    return rowCount;
  }

  /**
   * Soft-delete (sets deleted_at). Hard delete is not exposed.
   */
  static async softDelete(messageId, requesterId) {
    const { rows } = await pool.query(
      `UPDATE messages SET deleted_at = NOW()
       WHERE id = $1::uuid AND sender_id = $2::uuid
       RETURNING *`,
      [messageId, requesterId]
    );
    return rows[0] || null;
  }
}

module.exports = Message;

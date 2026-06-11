const pool = require('../config/db');

/**
 * Normalize a DB row (snake_case) to the camelCase shape the client expects.
 * This ensures REST API responses are identical in shape to real-time socket payloads,
 * which fixes the "messages appear on left side after refresh" bug (Issue 1).
 */
function normalize(row) {
  if (!row) return null;
  return {
    messageId:       row.id,
    senderId:        row.sender_id,
    receiverId:      row.receiver_id   || null,
    groupId:         row.group_id      || null,
    content:         row.deleted_at ? null : row.content,
    messageType:     row.type,
    type:            row.type,
    status:          row.status,
    sender_username: row.sender_username,
    createdAt:       row.created_at,
    created_at:      row.created_at,
    // Soft-delete: expose flag instead of hiding the row so the UI can show placeholder
    is_deleted:      !!row.deleted_at,
    deleted_at:      row.deleted_at || null,
  };
}

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
       WHERE m.id = $1::uuid`,
      [id]
    );
    return normalize(rows[0]) || null;
  }

  /**
   * All messages in a private conversation between two users, paginated.
   * NOTE: deleted messages are INCLUDED (with is_deleted flag) so the UI
   * can show the "This message was deleted" placeholder consistently.
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
         AND ((m.sender_id = $1::uuid AND m.receiver_id = $2::uuid)
               OR (m.sender_id = $2::uuid AND m.receiver_id = $1::uuid))
         ${cursor}
       ORDER BY m.created_at DESC
       LIMIT $3`,
      params
    );
    return rows.reverse().map(normalize);
  }

  /**
   * All messages in a group, paginated.
   * NOTE: deleted messages are INCLUDED (with is_deleted flag).
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
         ${cursor}
       ORDER BY m.created_at DESC
       LIMIT $2`,
      params
    );
    return rows.reverse().map(normalize);
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
    // Offline sync: return camelCase so client handler works uniformly
    return rows.map(normalize);
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
    // messageIds are already normalized to the DB 'id' field via normalize(),
    // but findUndelivered now returns normalized rows where id = row.id (not messageId).
    // We need the original DB ids — fetch via messageId field which maps to 'id'.
    const { rowCount } = await pool.query(
      `UPDATE messages SET status = 'delivered'
       WHERE id = ANY($1::uuid[]) AND status = 'sent'`,
      [messageIds]
    );
    return rowCount;
  }

  /**
   * Soft-delete (sets deleted_at). Hard delete is not exposed.
   * Only the sender can delete their own message.
   */
  static async softDelete(messageId, requesterId) {
    const { rows } = await pool.query(
      `UPDATE messages SET deleted_at = NOW()
       WHERE id = $1::uuid AND sender_id = $2::uuid
       RETURNING *`,
      [messageId, requesterId]
    );
    return normalize(rows[0]) || null;
  }

  /**
   * Get the group_id and receiver_id for a message (used to broadcast deletions).
   */
  static async getMessageMeta(messageId) {
    const { rows } = await pool.query(
      `SELECT id, sender_id, receiver_id, group_id, type FROM messages WHERE id = $1::uuid`,
      [messageId]
    );
    return rows[0] || null;
  }
}

module.exports = Message;

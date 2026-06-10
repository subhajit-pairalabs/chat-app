const pool = require('../config/db');

class Conversation {
  /**
   * List all conversations (private + group) for a user, sorted by latest activity.
   */
  static async listForUser(userId) {
    const { rows } = await pool.query(
      `SELECT
         c.id,
         c.type,
         c.group_name,
         c.created_at,
         -- last message preview
         m.content        AS last_message,
         m.created_at     AS last_message_at,
         m.sender_id      AS last_message_sender,
         -- unread count
         (SELECT COUNT(*) FROM messages
          WHERE receiver_id = $1
            AND status != 'read'
            AND (
              (c.type = 'private' AND sender_id = c.other_user_id)
              OR (c.type = 'group' AND group_id = c.id)
            )
         ) AS unread_count
       FROM (
         -- private conversations
         SELECT
           CONCAT(LEAST(sender_id, receiver_id), '-', GREATEST(sender_id, receiver_id)) AS id,
           'private' AS type,
           NULL AS group_name,
           MIN(created_at) AS created_at,
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_user_id
         FROM messages
         WHERE type = 'private' AND (sender_id = $1 OR receiver_id = $1)
         GROUP BY sender_id, receiver_id
         UNION ALL
         -- group conversations
         SELECT id::text, 'group', name, created_at, NULL
         FROM groups
         WHERE id IN (
           SELECT group_id FROM group_members WHERE user_id = $1::uuid
         )
       ) c
       LEFT JOIN LATERAL (
         SELECT content, created_at, sender_id FROM messages
         WHERE (
           (c.type = 'private' AND (sender_id = $1 OR receiver_id = $1))
           OR (c.type = 'group' AND group_id = c.id::uuid)
         )
         ORDER BY created_at DESC LIMIT 1
       ) m ON true
       ORDER BY COALESCE(m.created_at, c.created_at) DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Create a named group conversation.
   */
  static async createGroup({ name, creatorId, memberIds }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [group] } = await client.query(
        `INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING *`,
        [name, creatorId]
      );

      const allMembers = [...new Set([creatorId, ...memberIds])];
      for (const uid of allMembers) {
        await client.query(
          `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [group.id, uid]
        );
      }

      await client.query('COMMIT');
      return group;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Find a group by ID, including its members.
   */
  static async findGroupById(groupId) {
    const { rows: [group] } = await pool.query(
      `SELECT g.*, array_agg(gm.user_id) AS member_ids
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE g.id = $1
       GROUP BY g.id`,
      [groupId]
    );
    return group || null;
  }

  /**
   * Add member to group (creator / admin only — caller must enforce).
   */
  static async addMember(groupId, userId) {
    await pool.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [groupId, userId]
    );
  }

  /**
   * Remove member from group.
   */
  static async removeMember(groupId, userId) {
    await pool.query(
      `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
  }
}

module.exports = Conversation;

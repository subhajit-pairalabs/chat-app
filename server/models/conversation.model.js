const pool = require('../config/db');

class Conversation {
  /**
   * List all conversations (private + group) for a user, sorted by latest activity.
   * Returns other_username for private chats and group_name for groups.
   */
  static async listForUser(userId) {
    const { rows } = await pool.query(
      `SELECT
         c.id,
         c.type,
         c.group_name,
         c.other_user_id,
         u.username          AS other_username,
         c.created_at,
         m.content           AS last_message,
         m.created_at        AS last_message_at,
         m.sender_id         AS last_message_sender,
         (
           SELECT COUNT(*)::int FROM messages
           WHERE receiver_id = $1::uuid
             AND status != 'read'
             AND deleted_at IS NULL
             AND (
               (c.type = 'private' AND sender_id = c.other_user_id)
               OR (c.type = 'group' AND group_id = c.id::uuid)
             )
         ) AS unread_count
       FROM (
         -- private conversations: one row per unique peer
         SELECT
           CONCAT(
             LEAST($1::text, peer.user_id::text),
             '-',
             GREATEST($1::text, peer.user_id::text)
           )                                            AS id,
           'private'                                    AS type,
           NULL::text                                   AS group_name,
           MIN(m2.created_at)                           AS created_at,
           peer.user_id                                 AS other_user_id
         FROM messages m2
         CROSS JOIN LATERAL (
           SELECT
             CASE WHEN m2.sender_id = $1::uuid
                  THEN m2.receiver_id
                  ELSE m2.sender_id
             END AS user_id
         ) peer
         WHERE m2.type = 'private'
           AND (m2.sender_id = $1::uuid OR m2.receiver_id = $1::uuid)
           AND m2.deleted_at IS NULL
         GROUP BY peer.user_id

         UNION ALL

         -- group conversations
         SELECT
           g.id::text,
           'group',
           g.name,
           g.created_at,
           NULL::uuid
         FROM groups g
         JOIN group_members gm ON gm.group_id = g.id
         WHERE gm.user_id = $1::uuid
       ) c
       LEFT JOIN users u ON u.id = c.other_user_id
       LEFT JOIN LATERAL (
         SELECT content, created_at, sender_id
         FROM messages
         WHERE deleted_at IS NULL AND (
           (
             c.type = 'private'
             AND (
               (sender_id = $1::uuid AND receiver_id = c.other_user_id)
               OR (sender_id = c.other_user_id AND receiver_id = $1::uuid)
             )
           )
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
        `INSERT INTO groups (name, created_by) VALUES ($1, $2::uuid) RETURNING *`,
        [name, creatorId]
      );

      const allMembers = [...new Set([creatorId, ...memberIds])];
      for (const uid of allMembers) {
        await client.query(
          `INSERT INTO group_members (group_id, user_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
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
       WHERE g.id = $1::uuid
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
      `INSERT INTO group_members (group_id, user_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
      [groupId, userId]
    );
  }

  /**
   * Remove member from group.
   */
  static async removeMember(groupId, userId) {
    await pool.query(
      `DELETE FROM group_members WHERE group_id = $1::uuid AND user_id = $2::uuid`,
      [groupId, userId]
    );
  }
}

module.exports = Conversation;

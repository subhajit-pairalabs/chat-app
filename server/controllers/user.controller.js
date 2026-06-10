const pool = require('../config/db');

/**
 * GET /api/users
 * Search and list all users except the current user.
 * Supports ?search=<partial username> and ?limit=&offset= for pagination.
 */
async function listUsers(req, res, next) {
  try {
    const { search = '', limit = 20, offset = 0 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    const { rows } = await pool.query(
      `SELECT id, username, created_at
       FROM users
       WHERE id != $1::uuid
         AND ($2 = '' OR username ILIKE '%' || $2 || '%')
       ORDER BY username ASC
       LIMIT $3 OFFSET $4`,
      [req.user.id, search.trim(), safeLimit, safeOffset]
    );

    res.json({ data: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/:userId
 * Get a single user's public profile.
 */
async function getUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { rows: [user] } = await pool.query(
      'SELECT id, username, created_at FROM users WHERE id = $1::uuid',
      [userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, getUser };

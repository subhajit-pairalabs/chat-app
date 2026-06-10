const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const SALT_ROUNDS = 12;

function signToken(userId) {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 30) {
      return res.status(400).json({ error: 'username must be 2–30 characters' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username.trim()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const id = uuidv4();
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows: [user] } = await pool.query(
      'INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3) RETURNING id, username, created_at',
      [id, username.trim(), hash]
    );

    res.status(201).json({ token: signToken(user.id), user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const { rows: [user] } = await pool.query(
      'SELECT id, username, password_hash, created_at FROM users WHERE username = $1',
      [username]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      token: signToken(user.id),
      user: { id: user.id, username: user.username, created_at: user.created_at }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 */
async function me(req, res, next) {
  try {
    const { rows: [user] } = await pool.query(
      'SELECT id, username, created_at FROM users WHERE id = $1::uuid',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };

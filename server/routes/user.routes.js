const { Router } = require('express');
const { listUsers, getUser } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

// All user routes require authentication
router.use(authenticate);

// GET /api/users              — search users (exclude self)
router.get('/', listUsers);

// GET /api/users/:userId      — single user profile
router.get('/:userId', getUser);

module.exports = router;

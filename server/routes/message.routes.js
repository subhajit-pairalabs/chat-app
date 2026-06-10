const { Router } = require('express');
const ctrl = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

// All message routes require authentication
router.use(authenticate);

// GET  /api/messages/conversation/:userId   — DM history
router.get('/conversation/:userId', ctrl.getConversationMessages);

// GET  /api/messages/group/:groupId         — Group history
router.get('/group/:groupId', ctrl.getGroupMessages);

// POST /api/messages                        — Send (REST/async fallback)
router.post('/', ctrl.sendMessage);

// PATCH /api/messages/:messageId/status     — Delivered / read
router.patch('/:messageId/status', ctrl.updateMessageStatus);

// PATCH /api/messages/read/:senderId        — Bulk mark conversation read
router.patch('/read/:senderId', ctrl.markConversationRead);

// DELETE /api/messages/:messageId           — Soft-delete own message
router.delete('/:messageId', ctrl.deleteMessage);

module.exports = router;

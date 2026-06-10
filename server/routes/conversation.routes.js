const { Router } = require('express');
const ctrl = require('../controllers/conversation.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

router.use(authenticate);

// GET  /api/conversations                               — List all for current user
router.get('/', ctrl.listConversations);

// POST /api/conversations/group                         — Create group
router.post('/group', ctrl.createGroup);

// GET  /api/conversations/group/:groupId                — Group details + members
router.get('/group/:groupId', ctrl.getGroup);

// POST /api/conversations/group/:groupId/members        — Add member
router.post('/group/:groupId/members', ctrl.addGroupMember);

// DELETE /api/conversations/group/:groupId/members/:userId — Remove member / leave
router.delete('/group/:groupId/members/:userId', ctrl.removeGroupMember);

module.exports = router;

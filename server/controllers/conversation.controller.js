const Conversation = require('../models/conversation.model');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str) {
  return typeof str === 'string' && UUID_RE.test(str);
}

/**
 * GET /api/conversations
 * List all conversations for the authenticated user
 */
async function listConversations(req, res, next) {
  try {
    const conversations = await Conversation.listForUser(req.user.id);
    res.json({ data: conversations, count: conversations.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations/group
 * Create a new group conversation
 */
async function createGroup(req, res, next) {
  try {
    const { name, memberIds = [] } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ error: 'Group name must be 100 characters or less' });
    }

    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ error: 'memberIds must be an array' });
    }

    // Validate each member ID is a proper UUID
    const invalidIds = memberIds.filter(id => !isValidUUID(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        error: `Invalid member IDs (must be UUIDs): ${invalidIds.join(', ')}`
      });
    }

    const group = await Conversation.createGroup({
      name: name.trim(),
      creatorId: req.user.id,
      memberIds
    });

    res.status(201).json({ data: group });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/conversations/group/:groupId
 * Get group details with member list
 */
async function getGroup(req, res, next) {
  try {
    const { groupId } = req.params;

    if (!isValidUUID(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const group = await Conversation.findGroupById(groupId);

    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Only members can view
    const memberIds = group.member_ids.map(id => String(id));
    if (!memberIds.includes(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ data: group });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations/group/:groupId/members
 * Add a member to a group
 */
async function addGroupMember(req, res, next) {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;

    if (!isValidUUID(groupId)) return res.status(400).json({ error: 'Invalid group ID' });
    if (!isValidUUID(userId)) return res.status(400).json({ error: 'Invalid userId — must be a UUID' });

    const group = await Conversation.findGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (String(group.created_by) !== req.user.id) {
      return res.status(403).json({ error: 'Only the group creator can add members' });
    }

    await Conversation.addMember(groupId, userId);
    res.json({ message: 'Member added' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/conversations/group/:groupId/members/:userId
 * Remove a member from a group (creator or self-leave)
 */
async function removeGroupMember(req, res, next) {
  try {
    const { groupId, userId } = req.params;

    if (!isValidUUID(groupId)) return res.status(400).json({ error: 'Invalid group ID' });
    if (!isValidUUID(userId)) return res.status(400).json({ error: 'Invalid userId' });

    const group = await Conversation.findGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isSelf = userId === req.user.id;
    const isCreator = String(group.created_by) === req.user.id;

    if (!isSelf && !isCreator) {
      return res.status(403).json({ error: 'Only the group creator can remove members' });
    }

    await Conversation.removeMember(groupId, userId);
    res.json({ message: 'Member removed' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listConversations,
  createGroup,
  getGroup,
  addGroupMember,
  removeGroupMember
};

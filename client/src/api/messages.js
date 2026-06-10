import api from './api';

export async function getConversationMessages(userId, { limit = 50, before } = {}) {
  const params = { limit };
  if (before) params.before = before;
  const { data } = await api.get(`/messages/conversation/${userId}`, { params });
  return data.data;
}

export async function getGroupMessages(groupId, { limit = 50, before } = {}) {
  const params = { limit };
  if (before) params.before = before;
  const { data } = await api.get(`/messages/group/${groupId}`, { params });
  return data.data;
}

export async function markConversationRead(senderId) {
  await api.patch(`/messages/read/${senderId}`);
}

export async function deleteMessage(messageId) {
  await api.delete(`/messages/${messageId}`);
}

import api from './api';

export async function listConversations() {
  const { data } = await api.get('/conversations');
  return data.data;
}

export async function createGroup(name, memberIds = []) {
  const { data } = await api.post('/conversations/group', { name, memberIds });
  return data.data;
}

export async function getGroup(groupId) {
  const { data } = await api.get(`/conversations/group/${groupId}`);
  return data.data;
}

export async function addGroupMember(groupId, userId) {
  await api.post(`/conversations/group/${groupId}/members`, { userId });
}

export async function removeGroupMember(groupId, userId) {
  await api.delete(`/conversations/group/${groupId}/members/${userId}`);
}

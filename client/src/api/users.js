import api from './api';

export async function searchUsers(search = '', limit = 20, offset = 0) {
  const { data } = await api.get('/users', { params: { search, limit, offset } });
  return data.data;
}

export async function getUser(userId) {
  const { data } = await api.get(`/users/${userId}`);
  return data.data;
}

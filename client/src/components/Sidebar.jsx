import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { createGroup } from '../api/conversations';
import { formatDistanceToNow } from 'date-fns';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { conversations, openConversation, activeId, loadConversations, onlineUsers } = useChat();
  const [search, setSearch] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = conversations.filter(c =>
    (c.group_name || c.other_user_id || '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!groupName.trim()) return;
    setCreating(true);
    try {
      const memberIds = groupMembers.split(',').map(s => s.trim()).filter(Boolean);
      await createGroup(groupName.trim(), memberIds);
      await loadConversations();
      setShowNewGroup(false);
      setGroupName(''); setGroupMembers('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>{user?.username?.[0]?.toUpperCase()}</div>
          <span className={styles.username}>{user?.username}</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} title="New group" onClick={() => setShowNewGroup(true)}>＋</button>
          <button className={styles.iconBtn} title="Sign out" onClick={logout}>⎋</button>
        </div>
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder="Search conversations…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Conversation list */}
      <nav className={styles.list}>
        {filtered.length === 0 && (
          <p className={styles.empty}>No conversations yet</p>
        )}
        {filtered.map(conv => {
          const isGroup = conv.type === 'group';
          const convId = isGroup ? conv.id : conv.other_user_id;
          const name = isGroup ? conv.group_name : conv.other_user_id;
          const isActive = convId === activeId;
          const isOnline = !isGroup && onlineUsers.has(conv.other_user_id);

          return (
            <button
              key={convId}
              className={`${styles.convItem} ${isActive ? styles.active : ''}`}
              onClick={() => openConversation(convId, isGroup ? 'group' : 'private')}
            >
              <div className={styles.convAvatar}>
                {isGroup ? '👥' : name?.[0]?.toUpperCase() || '?'}
                {isOnline && <span className={styles.onlineDot} />}
              </div>
              <div className={styles.convInfo}>
                <div className={styles.convTop}>
                  <span className={styles.convName}>{name}</span>
                  {conv.last_message_at && (
                    <span className={styles.convTime}>
                      {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false })}
                    </span>
                  )}
                </div>
                <div className={styles.convBottom}>
                  <span className={styles.convPreview}>{conv.last_message || '…'}</span>
                  {conv.unread_count > 0 && (
                    <span className={styles.badge}>{conv.unread_count}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* New group modal */}
      {showNewGroup && (
        <div className={styles.modalOverlay} onClick={() => setShowNewGroup(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>New Group</h3>
            <form onSubmit={handleCreateGroup} className={styles.modalForm}>
              <input
                className={styles.modalInput}
                placeholder="Group name"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                autoFocus
                required
              />
              <input
                className={styles.modalInput}
                placeholder="Member IDs (comma-separated, optional)"
                value={groupMembers}
                onChange={e => setGroupMembers(e.target.value)}
              />
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowNewGroup(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.createBtn} disabled={creating}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}

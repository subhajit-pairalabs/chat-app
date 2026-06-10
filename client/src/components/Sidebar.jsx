import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { createGroup } from '../api/conversations';
import { searchUsers } from '../api/users';
import { formatDistanceToNow } from 'date-fns';
import styles from './Sidebar.module.css';

// ── User Search Picker ────────────────────────────────────────────────────────
function UserPicker({ onSelect, selectedUsers, placeholder = 'Search users…' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const users = await searchUsers(q.trim());
      setResults(users.filter(u => !selectedUsers.some(s => s.id === u.id)));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selectedUsers]);

  function handleChange(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 300);
  }

  function handleSelect(user) {
    onSelect(user);
    setQuery('');
    setResults([]);
  }

  return (
    <div className={styles.userPicker}>
      <input
        className={styles.modalInput}
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        autoComplete="off"
      />
      {loading && <div className={styles.pickerLoading}>Searching…</div>}
      {results.length > 0 && (
        <ul className={styles.pickerDropdown}>
          {results.map(u => (
            <li
              key={u.id}
              className={styles.pickerItem}
              onClick={() => handleSelect(u)}
            >
              <span className={styles.pickerAvatar}>{u.username[0].toUpperCase()}</span>
              <span className={styles.pickerName}>{u.username}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { user, logout } = useAuth();
  const { conversations, openConversation, activeId, loadConversations, onlineUsers } = useChat();

  const [search, setSearch] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState([]); // array of { id, username }
  const [creating, setCreating] = useState(false);

  // Filter conversations by username / group name
  const filtered = conversations.filter(c => {
    const label = c.type === 'group'
      ? (c.group_name || '')
      : (c.other_username || c.other_user_id || '');
    return label.toLowerCase().includes(search.toLowerCase());
  });

  // ── Create Group ────────────────────────────────────────────────────────────
  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!groupName.trim()) return;
    setCreating(true);
    try {
      const memberIds = groupMembers.map(u => u.id);
      const group = await createGroup(groupName.trim(), memberIds);
      await loadConversations();
      setShowNewGroup(false);
      setGroupName('');
      setGroupMembers([]);
      // Auto-open the new group
      openConversation(group.id, 'group');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  }

  // ── Start DM ────────────────────────────────────────────────────────────────
  async function handleStartDM(selectedUser) {
    setShowNewDM(false);
    // Check if conversation already exists
    const existing = conversations.find(c =>
      c.type === 'private' && c.other_user_id === selectedUser.id
    );
    if (existing) {
      openConversation(selectedUser.id, 'private');
    } else {
      // Open optimistically — first message will create the conversation
      openConversation(selectedUser.id, 'private');
    }
  }

  function closeNewGroup() {
    setShowNewGroup(false);
    setGroupName('');
    setGroupMembers([]);
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
          <button className={styles.iconBtn} title="New direct message" onClick={() => setShowNewDM(true)}>✉</button>
          <button className={styles.iconBtn} title="New group" onClick={() => setShowNewGroup(true)}>👥</button>
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
          <div className={styles.emptyState}>
            <p className={styles.empty}>
              {search ? 'No results found' : 'No conversations yet'}
            </p>
            {!search && (
              <p className={styles.emptyHint}>
                Start a conversation using ✉ or create a group with 👥
              </p>
            )}
          </div>
        )}
        {filtered.map(conv => {
          const isGroup = conv.type === 'group';
          // FIX BUG-05A: use other_username instead of other_user_id
          const convId = isGroup ? conv.id : conv.other_user_id;
          const name   = isGroup ? conv.group_name : (conv.other_username || conv.other_user_id);
          const isActive  = convId === activeId;
          const isOnline  = !isGroup && onlineUsers.has(conv.other_user_id);

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

      {/* New DM modal */}
      {showNewDM && (
        <div className={styles.modalOverlay} onClick={() => setShowNewDM(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>New Direct Message</h3>
            <p className={styles.modalHint}>Search for a user to start chatting</p>
            <UserPicker
              selectedUsers={[]}
              onSelect={handleStartDM}
              placeholder="Search by username…"
            />
            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowNewDM(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New group modal */}
      {showNewGroup && (
        <div className={styles.modalOverlay} onClick={closeNewGroup}>
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

              {/* FIX BUG-02/03: Replace text UUID input with user picker */}
              <label className={styles.pickerLabel}>Add members</label>
              <UserPicker
                selectedUsers={groupMembers}
                onSelect={u => setGroupMembers(prev => [...prev, u])}
                placeholder="Search users to add…"
              />

              {/* Selected member chips */}
              {groupMembers.length > 0 && (
                <div className={styles.memberChips}>
                  {groupMembers.map(u => (
                    <span key={u.id} className={styles.chip}>
                      {u.username}
                      <button
                        type="button"
                        className={styles.chipRemove}
                        onClick={() => setGroupMembers(prev => prev.filter(m => m.id !== u.id))}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={closeNewGroup}>
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

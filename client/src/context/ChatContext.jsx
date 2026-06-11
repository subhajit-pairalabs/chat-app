import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../socket';
import { listConversations } from '../api/conversations';
import { getConversationMessages, getGroupMessages, markConversationRead } from '../api/messages';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

/**
 * Normalize a REST API message (snake_case from DB) to the camelCase shape
 * that socket payloads also use. This is the definitive fix for Issue 1:
 * messages loaded from the DB after a refresh now have senderId (not sender_id),
 * so the isMine check (msg.senderId === user.id) works correctly.
 *
 * Note: server/models/message.model.js normalize() already does this on the server,
 * but we keep this client-side normalizer as a safety net for any future API changes.
 */
function normalizeMsg(msg) {
  if (!msg) return null;
  return {
    // Primary camelCase fields (what sockets use)
    messageId:       msg.messageId   || msg.id,
    senderId:        msg.senderId    || msg.sender_id,
    receiverId:      msg.receiverId  || msg.receiver_id  || null,
    groupId:         msg.groupId     || msg.group_id     || null,
    content:         msg.is_deleted ? null : (msg.content || msg.message || null),
    messageType:     msg.messageType || msg.type,
    type:            msg.messageType || msg.type,
    status:          msg.status      || 'sent',
    sender_username: msg.sender_username,
    createdAt:       msg.createdAt   || msg.created_at,
    created_at:      msg.createdAt   || msg.created_at,
    is_deleted:      !!msg.is_deleted || !!msg.deleted_at,
    deleted_at:      msg.deleted_at  || null,
  };
}

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);       // userId or groupId
  const [activeType, setActiveType] = useState(null);   // 'private' | 'group'
  const [messages, setMessages] = useState({});         // { [convId]: Message[] }
  const [typing, setTyping] = useState({});             // { [userId]: bool }
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Refs to avoid stale closures inside socket callbacks
  const activeIdRef      = useRef(activeId);
  const activeTypeRef    = useRef(activeType);
  const conversationsRef = useRef(conversations);
  const typingTimers     = useRef({});

  useEffect(() => { activeIdRef.current      = activeId;      }, [activeId]);
  useEffect(() => { activeTypeRef.current    = activeType;    }, [activeType]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // ── Load conversation list ──────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const data = await listConversations();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  }, []);

  useEffect(() => {
    if (user) loadConversations();
  }, [user, loadConversations]);

  // ── Load message history when active conversation changes ──────────────────
  useEffect(() => {
    if (!activeId || !activeType) return;
    if (messages[activeId]) return; // already loaded

    const load = async () => {
      try {
        const data = activeType === 'private'
          ? await getConversationMessages(activeId)
          : await getGroupMessages(activeId);

        // ISSUE 1 FIX: normalize all messages loaded from REST API
        setMessages(prev => ({ ...prev, [activeId]: data.map(normalizeMsg) }));

        if (activeType === 'private') {
          await markConversationRead(activeId).catch(() => {});
        }
      } catch (err) {
        console.error('Failed to load messages', err);
        setMessages(prev => ({ ...prev, [activeId]: [] }));
      }
    };
    load();
  }, [activeId, activeType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onReceiveMessage(msg) {
      // Normalize in case it came from offline_messages (DB shape) or socket (already camelCase)
      const m = normalizeMsg(msg);

      // For private: key is the OTHER user's ID
      // For group: key is the groupId
      const convId = m.messageType === 'group' || m.type === 'group'
        ? m.groupId
        : (m.senderId === user.id ? m.receiverId : m.senderId);

      if (!convId) return;

      setMessages(prev => {
        const existing = prev[convId] || [];
        // Deduplicate by messageId
        if (existing.some(x => x.messageId === m.messageId)) return prev;
        return { ...prev, [convId]: [...existing, m] };
      });

      // Bump conversation to top with latest message preview
      setConversations(prev => {
        const idx = prev.findIndex(c =>
          c.other_user_id === convId ||
          c.id === convId ||
          c.other_user_id === m.senderId
        );
        if (idx === -1) {
          // Unknown conversation — refresh list from server
          loadConversations();
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          last_message: m.content,
          last_message_at: m.createdAt || new Date().toISOString(),
          unread_count: convId === activeIdRef.current
            ? 0
            : (updated[idx].unread_count || 0) + 1
        };
        return [updated[idx], ...updated.filter((_, i) => i !== idx)];
      });

      // Auto-read if this is the active conversation
      if (convId === activeIdRef.current && (m.messageType === 'private' || m.type === 'private')) {
        markConversationRead(m.senderId).catch(() => {});
        socket.emit('message_read', { messageId: m.messageId, senderId: m.senderId });
      }
    }

    function onStatusUpdate({ messageId, status }) {
      setMessages(prev => {
        const updated = { ...prev };
        for (const convId of Object.keys(updated)) {
          updated[convId] = updated[convId].map(m =>
            m.messageId === messageId ? { ...m, status } : m
          );
        }
        return updated;
      });
    }

    function onOfflineMessages(msgs) {
      // offline_messages now come pre-normalized from the server
      msgs.forEach(m => onReceiveMessage(m));
    }

    function onTyping({ senderId, groupId, isTyping }) {
      const key = groupId || senderId;
      setTyping(prev => ({ ...prev, [key]: isTyping }));
      clearTimeout(typingTimers.current[key]);
      if (isTyping) {
        typingTimers.current[key] = setTimeout(() => {
          setTyping(prev => ({ ...prev, [key]: false }));
        }, 3000);
      }
    }

    function onUserOnline({ userId: uid }) {
      setOnlineUsers(prev => new Set([...prev, uid]));
    }

    function onUserOffline({ userId: uid }) {
      setOnlineUsers(prev => { const s = new Set(prev); s.delete(uid); return s; });
    }

    function onOnlineSnapshot({ userIds }) {
      setOnlineUsers(new Set(userIds));
    }

    // ISSUE 7: Handle message deletion from socket
    function onMessageDeleted({ messageId, deletedAt }) {
      setMessages(prev => {
        const updated = { ...prev };
        for (const convId of Object.keys(updated)) {
          updated[convId] = updated[convId].map(m =>
            m.messageId === messageId
              ? { ...m, content: null, is_deleted: true, deleted_at: deletedAt }
              : m
          );
        }
        return updated;
      });
    }

    // ISSUE 2,3,4 FIX: On socket reconnect (including after page refresh),
    // re-emit join_all_groups so the server re-adds us to all group rooms.
    // The server also does this automatically on every connection, but we emit
    // this as a belt-and-suspenders measure for edge cases.
    function onConnect() {
      console.log('[ChatContext] socket connected/reconnected — re-joining rooms');
      socket.emit('join_all_groups');

      // Also explicitly rejoin the currently active group (belt-and-suspenders)
      if (activeTypeRef.current === 'group' && activeIdRef.current) {
        socket.emit('join_group', activeIdRef.current);
      }
    }

    socket.on('receive_message',       onReceiveMessage);
    socket.on('message_status_update', onStatusUpdate);
    socket.on('offline_messages',      onOfflineMessages);
    socket.on('typing',                onTyping);
    socket.on('user_online',           onUserOnline);
    socket.on('user_offline',          onUserOffline);
    socket.on('online_users_snapshot', onOnlineSnapshot);
    socket.on('message_deleted',       onMessageDeleted);
    socket.on('connect',               onConnect);

    // If socket is already connected when this effect runs (e.g. after a React
    // re-render), fire onConnect immediately so rooms are always joined.
    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('receive_message',       onReceiveMessage);
      socket.off('message_status_update', onStatusUpdate);
      socket.off('offline_messages',      onOfflineMessages);
      socket.off('typing',                onTyping);
      socket.off('user_online',           onUserOnline);
      socket.off('user_offline',          onUserOffline);
      socket.off('online_users_snapshot', onOnlineSnapshot);
      socket.off('message_deleted',       onMessageDeleted);
      socket.off('connect',               onConnect);
    };
  }, [user, loadConversations]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send a message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback((content) => {
    const socket = getSocket();
    if (!socket || !activeId || !content.trim()) return;

    const payload = {
      type: activeType,
      senderId: user.id,
      ...(activeType === 'private' ? { receiverId: activeId } : { groupId: activeId }),
      content: content.trim()
    };

    socket.emit('send_message', payload);

    // Listen once for the server ack — use a stable named function to prevent accumulation
    const handler = ({ messageId, status, msg: serverMsg }) => {
      const optimistic = serverMsg ? normalizeMsg(serverMsg) : {
        messageId,
        senderId:    user.id,
        receiverId:  activeType === 'private' ? activeId : undefined,
        groupId:     activeType === 'group'   ? activeId : undefined,
        content:     content.trim(),
        messageType: activeType,
        type:        activeType,
        status,
        sender_username: user.username,
        createdAt:   new Date().toISOString(),
        is_deleted:  false,
      };

      setMessages(prev => {
        const existing = prev[activeId] || [];
        if (existing.some(m => m.messageId === messageId)) return prev;
        return { ...prev, [activeId]: [...existing, optimistic] };
      });

      // Bump conversation preview
      setConversations(prev => {
        const idx = prev.findIndex(c =>
          c.other_user_id === activeId || c.id === activeId
        );
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          last_message: content.trim(),
          last_message_at: optimistic.createdAt
        };
        return [updated[idx], ...updated.filter((_, i) => i !== idx)];
      });
    };

    socket.once('message_sent', handler);
  }, [activeId, activeType, user]);

  // ── Delete a message ───────────────────────────────────────────────────────
  const deleteMessage = useCallback((messageId) => {
    const socket = getSocket();
    if (!socket) return;
    // The server handles both persistence and real-time broadcast via delete_message event.
    // No REST API call needed — socket handler does soft-delete + notify all participants.
    socket.emit('delete_message', { messageId });
  }, []);

  // ── Typing indicator ───────────────────────────────────────────────────────
  const sendTyping = useCallback((isTyping) => {
    const socket = getSocket();
    if (!socket || !activeId) return;
    socket.emit('typing', {
      ...(activeType === 'private' ? { receiverId: activeId } : { groupId: activeId }),
      isTyping
    });
  }, [activeId, activeType]);

  // ── Open a conversation ────────────────────────────────────────────────────
  const openConversation = useCallback((id, type) => {
    const socket = getSocket();

    // Leave previous group room when switching conversations
    if (activeTypeRef.current === 'group' && activeIdRef.current && activeIdRef.current !== id) {
      socket?.emit('leave_group', activeIdRef.current);
    }

    setActiveId(id);
    setActiveType(type);

    if (type === 'group') {
      socket?.emit('join_group', id);
    }

    // Clear unread badge
    setConversations(prev =>
      prev.map(c => (c.id === id || c.other_user_id === id) ? { ...c, unread_count: 0 } : c)
    );
  }, []); // no deps — uses refs for current values

  // ── Derived: active conversation object ────────────────────────────────────
  const activeConversation = conversations.find(c =>
    c.id === activeId || c.other_user_id === activeId
  ) || null;

  return (
    <ChatContext.Provider value={{
      conversations, loadConversations,
      activeId, activeType, activeConversation, openConversation,
      messages, sendMessage, deleteMessage, sendTyping,
      typing, onlineUsers
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}

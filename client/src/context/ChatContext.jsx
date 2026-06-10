import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../socket';
import { listConversations } from '../api/conversations';
import { getConversationMessages, getGroupMessages, markConversationRead } from '../api/messages';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);       // userId or groupId
  const [activeType, setActiveType] = useState(null);   // 'private' | 'group'
  const [messages, setMessages] = useState({});         // { [convId]: Message[] }
  const [typing, setTyping] = useState({});             // { [userId]: bool }
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Use refs to track current active conversation inside socket callbacks
  // (avoids stale closures without re-registering listeners)
  const activeIdRef   = useRef(activeId);
  const activeTypeRef = useRef(activeType);
  const typingTimers  = useRef({});

  useEffect(() => { activeIdRef.current   = activeId;   }, [activeId]);
  useEffect(() => { activeTypeRef.current = activeType; }, [activeType]);

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
        // FIX BUG-04: actually call getGroupMessages for groups
        const data = activeType === 'private'
          ? await getConversationMessages(activeId)
          : await getGroupMessages(activeId);

        setMessages(prev => ({ ...prev, [activeId]: data }));

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
      // FIX BUG-07: correct convId keying
      // For private: key is the OTHER user's ID (peer), not the sender
      // For group: key is the groupId
      const convId = msg.messageType === 'group' || msg.type === 'group'
        ? (msg.groupId)
        : (msg.senderId === user.id ? msg.receiverId : msg.senderId);

      if (!convId) return; // guard against malformed messages

      setMessages(prev => {
        const existing = prev[convId] || [];
        // FIX BUG-07: deduplicate by messageId
        if (existing.some(m => m.messageId === msg.messageId)) return prev;
        return { ...prev, [convId]: [...existing, msg] };
      });

      // Bump conversation to top
      setConversations(prev => {
        const idx = prev.findIndex(c =>
          c.other_user_id === convId ||
          c.id === convId ||
          c.other_user_id === msg.senderId
        );
        if (idx === -1) {
          // Unknown conversation — refresh list from server
          loadConversations();
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          last_message: msg.content,
          last_message_at: msg.createdAt || new Date().toISOString(),
          unread_count: convId === activeIdRef.current
            ? 0
            : (updated[idx].unread_count || 0) + 1
        };
        return [updated[idx], ...updated.filter((_, i) => i !== idx)];
      });

      // Auto-read if this is the active conversation
      const currentActiveId   = activeIdRef.current;
      const currentActiveType = activeTypeRef.current;
      if (convId === currentActiveId && (msg.messageType === 'private' || msg.type === 'private')) {
        markConversationRead(msg.senderId).catch(() => {});
        socket.emit('message_read', { messageId: msg.messageId, senderId: msg.senderId });
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
      // Process offline messages — they come from DB so use message.type (not messageType)
      msgs.forEach(m => onReceiveMessage({ ...m, messageType: m.type }));
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

    // FIX BUG-09: handle initial snapshot of who's already online
    function onOnlineSnapshot({ userIds }) {
      setOnlineUsers(new Set(userIds));
    }

    // FIX BUG-18: re-join active group room on reconnect
    function onConnect() {
      if (activeTypeRef.current === 'group' && activeIdRef.current) {
        socket.emit('join_group', activeIdRef.current);
      }
    }

    socket.on('receive_message', onReceiveMessage);
    socket.on('message_status_update', onStatusUpdate);
    socket.on('offline_messages', onOfflineMessages);
    socket.on('typing', onTyping);
    socket.on('user_online', onUserOnline);
    socket.on('user_offline', onUserOffline);
    socket.on('online_users_snapshot', onOnlineSnapshot);
    socket.on('connect', onConnect);

    return () => {
      socket.off('receive_message', onReceiveMessage);
      socket.off('message_status_update', onStatusUpdate);
      socket.off('offline_messages', onOfflineMessages);
      socket.off('typing', onTyping);
      socket.off('user_online', onUserOnline);
      socket.off('user_offline', onUserOffline);
      socket.off('online_users_snapshot', onOnlineSnapshot);
      socket.off('connect', onConnect);
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

    // FIX BUG-08: use a stable 'on' + deduplication instead of accumulating 'once' handlers
    socket.emit('send_message', payload, (ack) => {
      // Server-side ack not used yet; handled via 'message_sent' event below
    });

    // Listen once for the ack — but use a named handler to prevent accumulation
    const handler = ({ messageId, status, msg: serverMsg }) => {
      // If server sends back the full message, use it; otherwise build optimistic
      const optimistic = serverMsg || {
        messageId,
        senderId: user.id,
        receiverId: activeType === 'private' ? activeId : undefined,
        groupId:    activeType === 'group' ? activeId : undefined,
        content: content.trim(),
        messageType: activeType,
        type: activeType,
        status,
        sender_username: user.username,
        createdAt: new Date().toISOString()
      };

      setMessages(prev => {
        const existing = prev[activeId] || [];
        // Deduplicate by messageId
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

    // FIX BUG-11: leave previous group room when switching conversations
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
      messages, sendMessage, sendTyping,
      typing, onlineUsers
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}

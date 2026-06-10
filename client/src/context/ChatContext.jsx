import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../socket';
import { listConversations } from '../api/conversations';
import { getConversationMessages, markConversationRead } from '../api/messages';
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
  const typingTimers = useRef({});

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
          : [];  // group messages loaded via same REST endpoint if needed
        setMessages(prev => ({ ...prev, [activeId]: data }));

        if (activeType === 'private') {
          await markConversationRead(activeId).catch(() => {});
        }
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    };
    load();
  }, [activeId, activeType]);

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onReceiveMessage(msg) {
      const convId = msg.type === 'group' ? msg.groupId : msg.senderId;
      setMessages(prev => ({
        ...prev,
        [convId]: [...(prev[convId] || []), msg]
      }));
      // Bump conversation to top
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === convId || c.other_user_id === msg.senderId);
        if (idx === -1) {
          loadConversations();
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          last_message: msg.content,
          last_message_at: msg.createdAt,
          unread_count: convId === activeId ? 0 : (updated[idx].unread_count || 0) + 1
        };
        return [updated[idx], ...updated.filter((_, i) => i !== idx)];
      });
      // Auto-read if this is the active conversation
      if (convId === activeId && msg.type === 'private') {
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
      msgs.forEach(m => onReceiveMessage(m));
    }

    function onTyping({ senderId, isTyping }) {
      setTyping(prev => ({ ...prev, [senderId]: isTyping }));
      clearTimeout(typingTimers.current[senderId]);
      if (isTyping) {
        typingTimers.current[senderId] = setTimeout(() => {
          setTyping(prev => ({ ...prev, [senderId]: false }));
        }, 3000);
      }
    }

    function onUserOnline({ userId }) {
      setOnlineUsers(prev => new Set([...prev, userId]));
    }

    function onUserOffline({ userId }) {
      setOnlineUsers(prev => { const s = new Set(prev); s.delete(userId); return s; });
    }

    socket.on('receive_message', onReceiveMessage);
    socket.on('message_status_update', onStatusUpdate);
    socket.on('offline_messages', onOfflineMessages);
    socket.on('typing', onTyping);
    socket.on('user_online', onUserOnline);
    socket.on('user_offline', onUserOffline);

    return () => {
      socket.off('receive_message', onReceiveMessage);
      socket.off('message_status_update', onStatusUpdate);
      socket.off('offline_messages', onOfflineMessages);
      socket.off('typing', onTyping);
      socket.off('user_online', onUserOnline);
      socket.off('user_offline', onUserOffline);
    };
  }, [activeId, loadConversations]);

  // ── Send a message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback((content) => {
    const socket = getSocket();
    if (!socket || !activeId || !content.trim()) return;

    socket.emit('send_message', {
      type: activeType,
      senderId: user.id,
      ...(activeType === 'private' ? { receiverId: activeId } : { groupId: activeId }),
      content: content.trim()
    });

    socket.once('message_sent', ({ messageId, status }) => {
      const optimistic = {
        messageId,
        senderId: user.id,
        content: content.trim(),
        type: activeType,
        status,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => ({
        ...prev,
        [activeId]: [...(prev[activeId] || []), optimistic]
      }));
    });
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
    setActiveId(id);
    setActiveType(type);
    if (type === 'group') socket?.emit('join_group', id);
    setConversations(prev =>
      prev.map(c => (c.id === id || c.other_user_id === id) ? { ...c, unread_count: 0 } : c)
    );
  }, []);

  return (
    <ChatContext.Provider value={{
      conversations, loadConversations,
      activeId, activeType, openConversation,
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

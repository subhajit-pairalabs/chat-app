import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import Message from './Message';
import styles from './MessagePane.module.css';

export default function MessagePane() {
  const { user } = useAuth();
  const {
    activeId,
    activeType,
    activeConversation,  // FIX BUG-05B: use resolved name from context
    messages,
    sendMessage,
    sendTyping,
    typing,
    onlineUsers
  } = useChat();

  const [input, setInput] = useState('');
  const bottomRef     = useRef(null);
  const typingTimeout = useRef(null);

  const paneMessages = messages[activeId] || [];

  // Determine who is typing in this conversation
  const isTyping = Object.entries(typing).some(([key, t]) => {
    if (!t) return false;
    if (activeType === 'group') return key === activeId; // group typing key
    return key !== user.id; // private: any other user typing
  });

  // FIX BUG-05B: display the resolved name
  const headerName = activeType === 'group'
    ? (activeConversation?.group_name || 'Group')
    : (activeConversation?.other_username || '…');

  const isOnline = activeType === 'private' && onlineUsers.has(activeId);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [paneMessages.length]);

  // FIX: cleanup typing timeout on unmount
  useEffect(() => {
    return () => clearTimeout(typingTimeout.current);
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
    sendTyping(false);
    clearTimeout(typingTimeout.current);
  }, [input, sendMessage, sendTyping]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e) {
    setInput(e.target.value);
    sendTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => sendTyping(false), 1500);
  }

  // Group consecutive messages by same sender
  const grouped = paneMessages.reduce((acc, msg, i) => {
    const prev = paneMessages[i - 1];
    const isFirst = !prev || prev.senderId !== msg.senderId;
    acc.push({ ...msg, isFirst });
    return acc;
  }, []);

  return (
    <div className={styles.pane}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerAvatar}>
          {activeType === 'group' ? '👥' : headerName?.[0]?.toUpperCase() || '?'}
          {isOnline && <span className={styles.onlineDot} />}
        </div>
        <div>
          {/* FIX BUG-05B: show resolved name */}
          <div className={styles.headerName}>{headerName}</div>
          <div className={styles.headerSub}>
            {activeType === 'group'
              ? 'Group chat'
              : isOnline ? 'Online' : 'Offline'
            }
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {grouped.length === 0 && (
          <p className={styles.noMessages}>No messages yet — say hello! 👋</p>
        )}
        {grouped.map((msg) => (
          <Message
            key={msg.messageId || msg.id}
            msg={msg}
            isMine={msg.senderId === user.id}
          />
        ))}
        {isTyping && (
          <div className={styles.typingIndicator}>
            <span /><span /><span />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <textarea
          className={styles.input}
          placeholder="Message…"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim()}
          title="Send (Enter)"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

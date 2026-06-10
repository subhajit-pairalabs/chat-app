import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import Message from './Message';
import styles from './MessagePane.module.css';

export default function MessagePane() {
  const { user } = useAuth();
  const { activeId, activeType, messages, sendMessage, sendTyping, typing } = useChat();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);
  const paneMessages = messages[activeId] || [];
  const isTyping = Object.entries(typing).some(([id, t]) => id !== user.id && t);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [paneMessages.length]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
    sendTyping(false);
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
          {activeType === 'group' ? '👥' : activeId?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <div className={styles.headerName}>{activeId}</div>
          <div className={styles.headerSub}>
            {activeType === 'group' ? 'Group' : 'Direct message'}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {grouped.length === 0 && (
          <p className={styles.noMessages}>No messages yet — say hello!</p>
        )}
        {grouped.map((msg) => (
          <Message
            key={msg.messageId}
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

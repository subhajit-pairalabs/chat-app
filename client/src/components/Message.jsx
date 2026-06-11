import { useState, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import styles from './Message.module.css';
import MessageMenu from './MessageMenu';

// ISSUE 6: WhatsApp-style tick system
const STATUS_ICONS = {
  sent:      { icon: '✓',  label: 'Sent',      className: '' },
  delivered: { icon: '✓✓', label: 'Delivered', className: '' },
  read:      { icon: '✓✓', label: 'Read',      className: styles.readTick }
};

export default function Message({ msg, isMine, onDelete, onReply }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const wrapperRef  = useRef(null);
  const longPressTimer = useRef(null);

  const time = msg.createdAt || msg.created_at
    ? format(new Date(msg.createdAt || msg.created_at), 'HH:mm')
    : '';

  const senderLabel = msg.sender_username || msg.senderId;
  const statusInfo  = isMine ? STATUS_ICONS[msg.status] : null;

  // ISSUE 7+8: deleted message placeholder
  const isDeleted = msg.is_deleted || !!msg.deleted_at;

  // ── Context menu handlers ─────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (msg.content) navigator.clipboard.writeText(msg.content).catch(() => {});
  }, [msg.content]);

  const handleDelete = useCallback(() => {
    if (onDelete) onDelete(msg.messageId);
  }, [onDelete, msg.messageId]);

  const handleReply = useCallback(() => {
    if (onReply) onReply(msg);
  }, [onReply, msg]);

  // Desktop: show menu on hover-click (right-click or hover button)
  function handleContextMenu(e) {
    e.preventDefault();
    setMenuVisible(v => !v);
  }

  // Mobile: long-press to show menu
  function handlePointerDown() {
    longPressTimer.current = setTimeout(() => setMenuVisible(true), 500);
  }
  function handlePointerUp() {
    clearTimeout(longPressTimer.current);
  }

  return (
    <div
      ref={wrapperRef}
      className={`${styles.wrapper} ${isMine ? styles.mine : styles.theirs} ${msg.isFirst ? styles.first : ''}`}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {!isMine && msg.isFirst && (
        <div className={styles.senderLabel}>{senderLabel}</div>
      )}

      <div className={styles.bubbleWrap}>
        {/* ISSUE 8: hover action button */}
        <button
          className={styles.menuTrigger}
          onClick={() => setMenuVisible(v => !v)}
          title="Message options"
          aria-label="Message options"
        >
          ⋯
        </button>

        {/* ISSUE 8: context menu */}
        <MessageMenu
          visible={menuVisible}
          isMine={isMine}
          onClose={() => setMenuVisible(false)}
          onCopy={handleCopy}
          onReply={handleReply}
          onDelete={handleDelete}
          anchorRef={wrapperRef}
        />

        <div className={`${styles.bubble} ${isDeleted ? styles.deletedBubble : ''}`}>
          {/* ISSUE 7: deleted message placeholder */}
          {isDeleted ? (
            <span className={styles.deletedText}>🚫 This message was deleted</span>
          ) : (
            <span className={styles.content}>{msg.content || msg.message}</span>
          )}

          <div className={styles.meta}>
            <span className={styles.time}>{time}</span>
            {/* ISSUE 6: status ticks — only on own messages, not on deleted */}
            {isMine && !isDeleted && statusInfo && (
              <span
                className={`${styles.status} ${statusInfo.className}`}
                title={statusInfo.label}
              >
                {statusInfo.icon}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

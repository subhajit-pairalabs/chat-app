import { useEffect, useRef, useCallback } from 'react';
import styles from './MessageMenu.module.css';

/**
 * MessageMenu — floating context menu for chat messages.
 *
 * Props:
 *   visible   – boolean
 *   isMine    – boolean (controls whether Delete is shown)
 *   onClose   – () => void
 *   onCopy    – () => void
 *   onReply   – () => void
 *   onDelete  – () => void  (only shown when isMine)
 *   anchorRef – ref to the message element (for positioning)
 */
export default function MessageMenu({ visible, isMine, onClose, onCopy, onReply, onDelete, anchorRef }) {
  const menuRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    function handler(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  function handle(fn) {
    return () => { fn(); onClose(); };
  }

  return (
    <div
      ref={menuRef}
      className={`${styles.menu} ${isMine ? styles.mine : styles.theirs}`}
      role="menu"
      aria-label="Message options"
    >
      <button className={styles.item} onClick={handle(onReply)} role="menuitem">
        <span className={styles.icon}>↩</span> Reply
      </button>
      <button className={styles.item} onClick={handle(onCopy)} role="menuitem">
        <span className={styles.icon}>⎘</span> Copy
      </button>
      {isMine && (
        <button className={`${styles.item} ${styles.danger}`} onClick={handle(onDelete)} role="menuitem">
          <span className={styles.icon}>🗑</span> Delete
        </button>
      )}
    </div>
  );
}

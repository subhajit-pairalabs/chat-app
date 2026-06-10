import { format } from 'date-fns';
import styles from './Message.module.css';

const STATUS_ICONS = {
  sent:      { icon: '✓',  label: 'Sent' },
  delivered: { icon: '✓✓', label: 'Delivered' },
  read:      { icon: '✓✓', label: 'Read' }
};

export default function Message({ msg, isMine }) {
  const time = msg.createdAt || msg.created_at
    ? format(new Date(msg.createdAt || msg.created_at), 'HH:mm')
    : '';

  // FIX BUG-05C: show sender_username instead of raw senderId UUID
  const senderLabel = msg.sender_username || msg.senderId;

  const statusInfo = STATUS_ICONS[msg.status];

  return (
    <div className={`${styles.wrapper} ${isMine ? styles.mine : styles.theirs} ${msg.isFirst ? styles.first : ''}`}>
      {!isMine && msg.isFirst && (
        <div className={styles.senderLabel}>{senderLabel}</div>
      )}
      <div className={styles.bubble}>
        <span className={styles.content}>{msg.content || msg.message}</span>
        <div className={styles.meta}>
          <span className={styles.time}>{time}</span>
          {isMine && statusInfo && (
            <span
              className={`${styles.status} ${msg.status === 'read' ? styles.read : ''}`}
              title={statusInfo.label}
            >
              {statusInfo.icon}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

import { format } from 'date-fns';
import styles from './Message.module.css';

const STATUS_ICONS = {
  sent:      '✓',
  delivered: '✓✓',
  read:      '✓✓'
};

export default function Message({ msg, isMine }) {
  const time = msg.createdAt
    ? format(new Date(msg.createdAt), 'HH:mm')
    : '';

  return (
    <div className={`${styles.wrapper} ${isMine ? styles.mine : styles.theirs} ${msg.isFirst ? styles.first : ''}`}>
      {!isMine && msg.isFirst && (
        <div className={styles.senderLabel}>{msg.senderId}</div>
      )}
      <div className={styles.bubble}>
        <span className={styles.content}>{msg.content || msg.message}</span>
        <div className={styles.meta}>
          <span className={styles.time}>{time}</span>
          {isMine && (
            <span className={`${styles.status} ${msg.status === 'read' ? styles.read : ''}`}>
              {STATUS_ICONS[msg.status] || '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

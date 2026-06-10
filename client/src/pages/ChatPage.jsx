import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import Sidebar from '../components/Sidebar';
import MessagePane from '../components/MessagePane';
import styles from './ChatPage.module.css';

export default function ChatPage() {
  const { activeId } = useChat();

  return (
    <div className={styles.layout}>
      <Sidebar />
      {activeId
        ? <MessagePane />
        : <div className={styles.empty}>
            <span className={styles.emptyIcon}>💬</span>
            <p>Select a conversation to start chatting</p>
          </div>
      }
    </div>
  );
}

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';

interface Notification {
  id: number;
  type: 'success' | 'error';
  message: string;
  leaving?: boolean;
}

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationIdRef = useRef(0);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<{ type: 'success' | 'error'; message: string }>(
        'notification',
        (event) => {
          notificationIdRef.current += 1;
          const id = notificationIdRef.current;
          const newNotification: Notification = { id, ...event.payload };
          setNotifications((prev) => [...prev, newNotification]);

          // Begin exit animation slightly before removal
          setTimeout(() => {
            setNotifications((prev) =>
              prev.map((n) => (n.id === id ? { ...n, leaving: true } : n)),
            );
          }, 4700);

          setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
          }, 5000);
        },
      );
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`notification ${notification.type}${notification.leaving ? ' leaving' : ''}`}
        >
          {notification.message}
        </div>
      ))}
    </div>
  );
};

export default Notifications;

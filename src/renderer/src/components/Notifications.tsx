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
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
          const leaveTimer = setTimeout(() => {
            setNotifications((prev) =>
              prev.map((n) => (n.id === id ? { ...n, leaving: true } : n)),
            );
          }, 4700);

          const removeTimer = setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
          }, 5000);

          timeoutsRef.current.push(leaveTimer, removeTimer);
        },
      );
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
      for (const t of timeoutsRef.current) {
        clearTimeout(t);
      }
      timeoutsRef.current = [];
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

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';

interface Notification {
  id: number;
  type: 'success' | 'error';
  message: string;
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
          const newNotification = {
            id: notificationIdRef.current,
            ...event.payload,
          };
          setNotifications((prev) => [...prev, newNotification]);

          setTimeout(() => {
            setNotifications((prev) =>
              prev.filter((n) => n.id !== newNotification.id),
            );
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
          data-key={notification.id}
          className={`notification ${notification.type}`}
        >
          {notification.message}
        </div>
      ))}
    </div>
  );
};

export default Notifications;

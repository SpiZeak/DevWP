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
    const removeListener = window.electronAPI.onNotification((data) => {
      notificationIdRef.current += 1;
      const newNotification = {
        id: notificationIdRef.current,
        ...data,
      };
      setNotifications((prev) => [...prev, newNotification]);

      setTimeout(() => {
        setNotifications((prev) =>
          prev.filter((n) => n.id !== newNotification.id),
        );
      }, 5000);
    });

    return () => {
      removeListener();
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

import { useEffect, useState } from 'react'
import '../SiteList/SiteList.scss'

interface Notification {
  id: number
  type: 'success' | 'error'
  message: string
}

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    const removeListener = window.electronAPI.onNotification((data) => {
      const newNotification = {
        id: Date.now(),
        ...data
      }
      setNotifications((prev) => [...prev, newNotification])

      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== newNotification.id))
      }, 5000)
    })

    return () => {
      removeListener()
    }
  }, [])

  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <div key={notification.id} className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      ))}
    </div>
  )
}

export default Notifications

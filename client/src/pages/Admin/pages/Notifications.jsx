import { useState, useEffect } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import EmailTemplatesPanel from './EmailTemplatesPanel';
import { Bell } from 'lucide-react';

function Notifications() {
  const { API_URL } = useOutletContext();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newNotification, setNewNotification] = useState({ title: '', message: '', type: 'info' });

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/email')) return 'email-templates';
    if (path.includes('/sms')) return 'sms-settings';
    if (path.includes('/logs')) return 'notification-logs';
    return 'push-notifications';
  };

  const activeTab = getActiveTab();

  const getTabTitle = () => {
    const titles = {
      'push-notifications': 'Push Notifications',
      'email-templates': 'Email Templates',
      'sms-settings': 'SMS Settings',
      'notification-logs': 'Notification Logs'
    };
    return titles[activeTab] || 'Notifications';
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/notifications`);
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = async () => {
    if (!newNotification.title || !newNotification.message) {
      alert('Please fill title and message');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNotification)
      });
      const data = await res.json();
      if (data.success) {
        alert('Notification sent successfully');
        setNewNotification({ title: '', message: '', type: 'info' });
        fetchNotifications();
      } else {
        alert(data.error || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'push-notifications' || activeTab === 'notification-logs') {
      fetchNotifications();
    }
  }, [activeTab]);

  if (activeTab === 'push-notifications') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>{getTabTitle()}</h2>
        </div>

        <div className="admin-form-card">
          <h3>Send New Notification</h3>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Title</label>
              <input type="text" value={newNotification.title} onChange={(e) => setNewNotification(prev => ({ ...prev, title: e.target.value }))} placeholder="Notification title" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Type</label>
              <select value={newNotification.type} onChange={(e) => setNewNotification(prev => ({ ...prev, type: e.target.value }))} className="admin-select">
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
            <button onClick={sendNotification} className="admin-btn primary">Send to All Users</button>
          </div>
          <div className="admin-form-group" style={{ marginTop: 12, width: '100%' }}>
            <label>Message</label>
            <textarea value={newNotification.message} onChange={(e) => setNewNotification(prev => ({ ...prev, message: e.target.value }))} placeholder="Notification message" className="admin-input" rows={3} style={{ width: '100%', resize: 'vertical' }} />
          </div>
        </div>

        {loading ? (
          <div className="admin-loading">Loading notifications...</div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Message</th>
                  <th>Type</th>
                  <th>Sent To</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {notifications.length === 0 ? (
                  <tr><td colSpan="5" className="no-data">No notifications sent yet</td></tr>
                ) : (
                  notifications.map((notif, idx) => (
                    <tr key={notif._id || idx}>
                      <td>{notif.title}</td>
                      <td>{notif.message?.substring(0, 50)}...</td>
                      <td><span className={`status-badge status-${notif.type}`}>{notif.type}</span></td>
                      <td>{notif.sentTo || 'All Users'}</td>
                      <td>{new Date(notif.createdAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'email-templates') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header email-tpl-page-header">
          <h2>{getTabTitle()}</h2>
          <span className="email-tpl-admin-badge">Admin mode</span>
        </div>
        <EmailTemplatesPanel />
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{getTabTitle()}</h2>
      </div>
      <div className="admin-placeholder">
        <div className="placeholder-icon"><Bell size={14} strokeWidth={2.2} /></div>
        <p>This section is under development.</p>
      </div>
    </div>
  );
}

export default Notifications;

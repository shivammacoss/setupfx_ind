const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error', 'announcement'],
    default: 'info'
  },
  // Target audience
  targetType: {
    type: String,
    enum: ['all', 'specific', 'segment'],
    default: 'all'
  },
  // Specific user IDs if targetType is 'specific'
  targetUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Read status per user
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Notification metadata
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  // Optional link/action
  actionUrl: {
    type: String,
    default: null
  },
  actionLabel: {
    type: String,
    default: null
  },
  // Expiry
  expiresAt: {
    type: Date,
    default: null
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  // Created by admin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ isActive: 1, expiresAt: 1 });
notificationSchema.index({ 'readBy.userId': 1 });

// Static method to get notifications for a user
notificationSchema.statics.getForUser = async function(userId, options = {}) {
  const { limit = 50, skip = 0, unreadOnly = false } = options;
  
  const query = {
    isActive: true,
    $or: [
      { targetType: 'all' },
      { targetType: 'specific', targetUsers: userId }
    ],
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  };
  
  const notifications = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  
  // Add read status for this user
  return notifications.map(notif => ({
    ...notif,
    isRead: notif.readBy?.some(r => r.userId?.toString() === userId.toString()) || false
  }));
};

// Static method to mark notification as read
notificationSchema.statics.markAsRead = async function(notificationId, userId) {
  return this.findByIdAndUpdate(
    notificationId,
    {
      $addToSet: {
        readBy: { userId, readAt: new Date() }
      }
    },
    { new: true }
  );
};

// Static method to mark all as read for a user
notificationSchema.statics.markAllAsRead = async function(userId) {
  const notifications = await this.find({
    isActive: true,
    'readBy.userId': { $ne: userId }
  });
  
  const updates = notifications.map(notif => 
    this.findByIdAndUpdate(notif._id, {
      $addToSet: { readBy: { userId, readAt: new Date() } }
    })
  );
  
  await Promise.all(updates);
  return { count: notifications.length };
};

// Static method to get unread count for a user
notificationSchema.statics.getUnreadCount = async function(userId) {
  const notifications = await this.find({
    isActive: true,
    $or: [
      { targetType: 'all' },
      { targetType: 'specific', targetUsers: userId }
    ],
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ],
    'readBy.userId': { $ne: userId }
  });
  
  return notifications.length;
};

module.exports = mongoose.model('Notification', notificationSchema);

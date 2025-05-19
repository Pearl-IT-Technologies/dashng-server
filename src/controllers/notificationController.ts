import { Request, Response } from 'express';
import Notification from '../models/Notification';

// Get user notifications
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const { limit = 20, page = 1, read } = req.query;
    
    // Build query
    const query: any = { user: req.user?.id };
    
    // Filter by read status if provided
    if (read !== undefined) {
      query.read = read === 'true';
    }

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Get total count for pagination
    const total = await Notification.countDocuments(query);

    res.status(200).json({
      success: true,
      count: notifications.length,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
      },
      data: notifications
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching notifications'
    });
  }
};

// Mark notification as read
export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if notification belongs to user
    if (notification.user.toString() !== req.user?.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this notification'
      });
    }

    // Mark as read
    notification.read = true;
    await notification.save();

    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while marking notification as read'
    });
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (req: Request, res: Response) => {
  try {
    await Notification.updateMany(
      { user: req.user?.id, read: false },
      { read: true }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while marking all notifications as read'
    });
  }
};

// Delete notification
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if notification belongs to user
    if (notification.user.toString() !== req.user?.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this notification'
      });
    }

    await Notification.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while deleting notification'
    });
  }
};

// Get notification count
export const getNotificationCount = async (req: Request, res: Response) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user?.id,
      read: false
    });

    res.status(200).json({
      success: true,
      data: { count }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while getting notification count'
    });
  }
};
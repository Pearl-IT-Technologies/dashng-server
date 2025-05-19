import express from 'express';
import { 
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationCount
} from '../controllers/notificationController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// All notification routes are protected
router.get('/', protect, getUserNotifications);
router.get('/count', protect, getNotificationCount);
router.put('/:id/read', protect, markNotificationAsRead);
router.put('/read-all', protect, markAllNotificationsAsRead);
router.delete('/:id', protect, deleteNotification);

export default router;
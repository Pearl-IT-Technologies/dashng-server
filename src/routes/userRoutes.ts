import express from 'express';
import { 
  getUserProfile, 
  updateUserProfile, 
  getUserSettings, 
  updateUserSettings,
  changePassword 
} from '../controllers/userController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// User profile routes
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.get('/settings', protect, getUserSettings);
router.put('/settings', protect, updateUserSettings);
router.put('/change-password', protect, changePassword);

export default router;
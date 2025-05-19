import express from 'express';
import { register, login, getCurrentUser, logout } from '../controllers/authController';
// import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Auth routes
router.post('/register', register);
router.post('/login', login);
router.get('/user', getCurrentUser);
router.post('/logout', logout);

export default router;
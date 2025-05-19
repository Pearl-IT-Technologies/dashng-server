import express from 'express';
import { 
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateInventory,
  getInventoryHistory
} from '../controllers/productController';
import { protect, authorize } from '../middleware/authMiddleware';
import { UserRole } from '../models/User';

const router = express.Router();

// Public routes
router.get('/', getAllProducts);
router.get('/:id', getProductById);

// Protected routes
router.post(
  '/', 
  protect, 
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), 
  createProduct
);

router.put(
  '/:id', 
  protect, 
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), 
  updateProduct
);

router.delete(
  '/:id', 
  protect, 
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), 
  deleteProduct
);

// Inventory related routes
router.put(
  '/:id/inventory', 
  protect, 
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.STOREKEEPER), 
  updateInventory
);

router.get(
  '/:id/inventory-history', 
  protect, 
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.STOREKEEPER), 
  getInventoryHistory
);

export default router;
import { Request, Response } from 'express';
import Product from '../models/Product';
import { UserRole } from '../models/User';
import InventoryHistory, { InventoryActionType } from '../models/InventoryHistory';
import Notification, { NotificationType } from '../models/Notification';
import mongoose from 'mongoose';

// Get all products
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      search,
      featured,
      sort,
      limit = 20,
      page = 1
    } = req.query;

    // Build query
    const query: any = {};

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Filter by search term
    if (search) {
      query.$text = { $search: search as string };
    }

    // Filter by featured
    if (featured === 'true') {
      query.featured = true;
    }

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Build sort options
    let sortOptions = {};
    if (sort) {
      const sortField = (sort as string).startsWith('-') 
        ? (sort as string).substring(1) 
        : sort;
      const sortOrder = (sort as string).startsWith('-') ? -1 : 1;
      sortOptions = { [sortField as string]: sortOrder };
    } else {
      // Default sort by newest
      sortOptions = { createdAt: -1 };
    }

    // Execute query with pagination
    const products = await Product.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit));

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      count: products.length,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
      },
      data: products
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching products'
    });
  }
};

// Get single product by ID
export const getProductById = async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching product'
    });
  }
};

// Create new product
export const createProduct = async (req: Request, res: Response) => {
  try {
    // Create product
    const product = await Product.create(req.body);

    // Log inventory action
    await InventoryHistory.create({
      product: product._id,
      actionType: InventoryActionType.PRODUCT_CREATED,
      quantity: product.quantity,
      previousQuantity: 0,
      newQuantity: product.quantity,
      performedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while creating product'
    });
  }
};

// Update product
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const previousQuantity = product.quantity;

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    // Log inventory action if quantity changed
    if (previousQuantity !== req.body.quantity) {
      await InventoryHistory.create({
        product: product._id,
        actionType: InventoryActionType.STOCK_ADJUSTED,
        quantity: Math.abs(req.body.quantity - previousQuantity),
        previousQuantity,
        newQuantity: req.body.quantity,
        performedBy: req.user.id
      });

      // Check for low stock and create notification if needed
      if (req.body.quantity <= product.lowStockThreshold) {
        // Create notification for storekeepers
        const storekeepersQuery = await mongoose.model('User').find({ 
          role: UserRole.STOREKEEPER 
        });

        // Get storekeeper IDs who have enabled low stock alerts
        const storekeeperSettings = await mongoose.model('UserSettings').find({
          user: { $in: storekeepersQuery.map(sk => sk._id) },
          lowStockAlerts: true
        });

        // Create notifications for each storekeeper
        for (const setting of storekeeperSettings) {
          await Notification.create({
            user: setting.user,
            type: NotificationType.LOW_STOCK,
            title: 'Low Stock Alert',
            message: `Product "${product.name}" is low in stock (${req.body.quantity} remaining)`,
            data: {
              productId: product._id,
              productName: product.name,
              quantity: req.body.quantity,
              threshold: product.lowStockThreshold
            }
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      data: updatedProduct
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while updating product'
    });
  }
};

// Delete product
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while deleting product'
    });
  }
};

// Update product inventory
export const updateInventory = async (req: Request, res: Response) => {
  try {
    const { quantity } = req.body;
    
    if (quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Quantity is required'
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const previousQuantity = product.quantity;
    const newQuantity = Number(quantity);
    const actionType = newQuantity > previousQuantity 
      ? InventoryActionType.STOCK_ADDED 
      : InventoryActionType.STOCK_REMOVED;

    // Update product quantity
    product.quantity = newQuantity;
    await product.save();

    // Log inventory action
    await InventoryHistory.create({
      product: product._id,
      actionType,
      quantity: Math.abs(newQuantity - previousQuantity),
      previousQuantity,
      newQuantity,
      performedBy: req.user.id,
      notes: req.body.notes
    });

    // Create notifications for storekeepers if stock update notifications are enabled
    if (actionType === InventoryActionType.STOCK_ADDED || 
        actionType === InventoryActionType.STOCK_REMOVED) {
      const storekeepersQuery = await mongoose.model('User').find({ 
        role: UserRole.STOREKEEPER 
      });

      // Get storekeeper IDs who have enabled stock update notifications
      const storekeeperSettings = await mongoose.model('UserSettings').find({
        user: { $in: storekeepersQuery.map(sk => sk._id) },
        stockUpdateNotifications: true
      });

      // Create notifications for each storekeeper
      for (const setting of storekeeperSettings) {
        await Notification.create({
          user: setting.user,
          type: NotificationType.STOCK_UPDATE,
          title: 'Stock Update',
          message: `Product "${product.name}" stock updated from ${previousQuantity} to ${newQuantity}`,
          data: {
            productId: product._id,
            productName: product.name,
            previousQuantity,
            newQuantity,
            actionType
          }
        });
      }
    }

    // Check for low stock and create notification
    if (newQuantity <= product.lowStockThreshold) {
      const storekeepersQuery = await mongoose.model('User').find({ 
        role: UserRole.STOREKEEPER 
      });

      // Get storekeeper IDs who have enabled low stock alerts
      const storekeeperSettings = await mongoose.model('UserSettings').find({
        user: { $in: storekeepersQuery.map(sk => sk._id) },
        lowStockAlerts: true
      });

      // Create notifications for each storekeeper
      for (const setting of storekeeperSettings) {
        await Notification.create({
          user: setting.user,
          type: NotificationType.LOW_STOCK,
          title: 'Low Stock Alert',
          message: `Product "${product.name}" is low in stock (${newQuantity} remaining)`,
          data: {
            productId: product._id,
            productName: product.name,
            quantity: newQuantity,
            threshold: product.lowStockThreshold
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while updating inventory'
    });
  }
};

// Get inventory history for a product
export const getInventoryHistory = async (req: Request, res: Response) => {
  try {
    const history = await InventoryHistory.find({ product: req.params.id })
      .sort({ createdAt: -1 })
      .populate('performedBy', 'username firstName lastName');

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching inventory history'
    });
  }
};
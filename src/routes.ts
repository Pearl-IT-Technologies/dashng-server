import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import { WebSocketServer, WebSocket } from 'ws';
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertProductSchema, insertCartItemSchema, insertOrderSchema, insertOrderItemSchema, insertCouponSchema, insertWishlistItemSchema, insertTempAccessTokenSchema, insertUserAddressSchema, insertUserPaymentMethodSchema, insertUserNotificationSchema, insertUserSettingSchema } from "@shared/schema";
import { initializePayment, verifyPayment, processPartialPayment } from "./paymentGateways";
import { predictInventoryTrends, getInventoryAlerts, generateRestockPlan } from "./services/inventoryTrendPredictor";
import { subMonths, startOfMonth, endOfMonth, eachDayOfInterval, format, parseISO, isWithinInterval } from "date-fns";

// Generate a unique tracking number for orders
function generateTrackingNumber(): string {
  // Format: DASH-YYYYMMDD-XXXX where XXXX is a random alphanumeric string
  const date = new Date();
  const dateStr = format(date, 'yyyyMMdd');
  // Generate a random alphanumeric string (upper-case letters and numbers)
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomStr = '';
  for (let i = 0; i < 6; i++) {
    randomStr += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return `DASH-${dateStr}-${randomStr}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create uploads directory if it doesn't exist
  const uploadDir = path.resolve('./uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  console.log('Upload directory absolute path:', uploadDir);
  
  // Serve static files from uploads directory
  app.use('/uploads', express.static(uploadDir));
  
  // Log to confirm the static middleware is set up correctly
  console.log('Static file middleware set up for /uploads pointing to', uploadDir);
  
  // Set up authentication routes
  setupAuth(app);
  
  // Configure multer for file uploads with improved directory structure
  const productUploadStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      // Create a structured directory system
      const baseUploadDir = './uploads';
      const productImagesDir = `${baseUploadDir}/products`;
      
      // Get product info for subdirectory if available
      let productDir = productImagesDir;
      
      if (req.body && req.body.productId) {
        productDir = `${productImagesDir}/${req.body.productId}`;
      } else if (req.body && req.body.productName) {
        // Create a clean directory name from product name
        const cleanName = req.body.productName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        productDir = `${productImagesDir}/${cleanName}`;
      } else if (req.query && req.query.category) {
        // Organize by category if product info not available
        productDir = `${productImagesDir}/${req.query.category}`;
      }
      
      // Create directories if they don't exist
      [baseUploadDir, productImagesDir, productDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
      
      cb(null, productDir);
    },
    filename: function (req, file, cb) {
      // Generate a more descriptive filename based on product information
      let prefix = 'product';
      
      // Use product info if available
      if (req.body) {
        if (req.body.productId) {
          prefix = `product-${req.body.productId}`;
        } else if (req.body.productName) {
          prefix = req.body.productName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        }
      }
      
      // Add image type descriptor if available
      if (req.body && req.body.imageType) {
        prefix += `-${req.body.imageType}`;
      }
      
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E4);
      const ext = path.extname(file.originalname);
      cb(null, `${prefix}-${uniqueSuffix}${ext}`);
    }
  });
  
  const productFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  };
  
  const productUpload = multer({ 
    storage: productUploadStorage,
    fileFilter: productFileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB file size limit
    }
  });

  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: Function) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // Middleware to check if user is admin
  const isAdmin = (req: Request, res: Response, next: Function) => {
    // Log auth info for debugging
    console.log('Auth check - isAdmin middleware:', {
      isAuthenticated: req.isAuthenticated(),
      user: req.user ? {
        username: (req.user as any).username,
        isAdmin: (req.user as any).isAdmin,
        isMasterAdmin: (req.user as any).isMasterAdmin,
        isSuperAdmin: (req.user as any).isSuperAdmin,
        adminRole: (req.user as any).adminRole
      } : null
    });
    
    if (req.isAuthenticated() && req.user && (req.user as any).isAdmin) {
      return next();
    }
    res.status(403).json({ message: "Forbidden" });
  };
  
  // Middleware to check if user is owner (previously master admin)
  const isOwner = (req: Request, res: Response, next: Function) => {
    // Log auth info for debugging
    console.log('Auth check - isOwner middleware:', {
      isAuthenticated: req.isAuthenticated(),
      user: req.user ? {
        username: (req.user as any).username,
        isAdmin: (req.user as any).isAdmin,
        isMasterAdmin: (req.user as any).isMasterAdmin,
        isSuperAdmin: (req.user as any).isSuperAdmin,
        adminRole: (req.user as any).adminRole
      } : null
    });
    
    if (req.isAuthenticated() && req.user && 
        (req.user as any).isAdmin && 
        ((req.user as any).isMasterAdmin || 
         (req.user as any).adminRole === 'owner' || 
         (req.user as any).adminRole === 'super' ||
         (req.user as any).isSuperAdmin)) {
      return next();
    }
    res.status(403).json({ message: "Owner access required" });
  };
  
  // Middleware to check if user is storekeeper or owner
  const isStorekeeperOrOwner = (req: Request, res: Response, next: Function) => {
    if (req.isAuthenticated() && req.user && (req.user as any).isAdmin && 
        ((req.user as any).isMasterAdmin || 
         (req.user as any).adminRole === 'owner' || 
         (req.user as any).adminRole === 'storekeeper')) {
      return next();
    }
    res.status(403).json({ message: "Storekeeper or owner access required" });
  };
  
  // Middleware to check if user is super admin
  const isSuperAdmin = (req: Request, res: Response, next: Function) => {
    if (req.isAuthenticated() && req.user && 
        (req.user as any).isAdmin && 
        (req.user as any).isSuperAdmin) {
      return next();
    }
    res.status(403).json({ message: "Super admin access required" });
  };
  
  // Middleware to check if user is sales personnel or has higher permissions
  const isSalesOrAdmin = (req: Request, res: Response, next: Function) => {
    if (req.isAuthenticated() && req.user && 
        ((req.user as any).isAdmin) && 
        ((req.user as any).adminRole === 'sales' || 
         // Removed storekeeper from having sales capabilities
         (req.user as any).adminRole === 'manager' || 
         (req.user as any).adminRole === 'owner' || 
         (req.user as any).isSuperAdmin ||
         (req.user as any).isMasterAdmin)) {
      return next();
    }
    res.status(403).json({ message: "Sales personnel or higher privileges required" });
  };

  // Configure multer storage for file uploads
  const storage_config = multer.diskStorage({
    destination: (req, file, cb) => {
      // Create upload directory if it doesn't exist
      const dir = './uploads/orders';
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename with timestamp and original extension
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, 'order-scan-' + uniqueSuffix + ext);
    }
  });

  // File filter to allow only images for order uploads
  const orderFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  };

  // Create multer upload configuration for order scans
  const orderUpload = multer({ 
    storage: storage_config,
    fileFilter: orderFileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB file size limit
    }
  });

  // Function to broadcast order updates
  const broadcastOrderUpdate = async () => {
    try {
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'order_update',
        data: {
          recentOrders
        }
      });
    } catch (error) {
      console.error('Error broadcasting order update:', error);
    }
  };

  // Product routes
  
  // Smart Inventory Trend Predictor Endpoints
  app.get("/api/inventory/trends", isAdmin, async (req, res) => {
    try {
      const categoryFilter = req.query.category as string | undefined;
      const daysToPredict = req.query.days ? parseInt(req.query.days as string) : undefined;
      const minConfidence = req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : undefined;
      
      // Parse include/exclude product IDs if provided
      let includeProducts: number[] | undefined;
      let excludeProducts: number[] | undefined;
      
      if (req.query.includeProducts) {
        try {
          includeProducts = JSON.parse(req.query.includeProducts as string);
          if (!Array.isArray(includeProducts)) includeProducts = undefined;
        } catch (e) {
          // Ignore parsing errors and use undefined
        }
      }
      
      if (req.query.excludeProducts) {
        try {
          excludeProducts = JSON.parse(req.query.excludeProducts as string);
          if (!Array.isArray(excludeProducts)) excludeProducts = undefined;
        } catch (e) {
          // Ignore parsing errors and use undefined
        }
      }
      
      const trends = await predictInventoryTrends({
        categoryFilter,
        daysToPredict,
        minConfidence,
        includeProducts,
        excludeProducts
      });
      
      res.json(trends);
    } catch (error) {
      console.error('Error fetching inventory trends:', error);
      res.status(500).json({ 
        message: "Failed to predict inventory trends", 
        error: (error as Error).message 
      });
    }
  });
  
  // Get inventory alerts for products that need attention
  app.get("/api/inventory/alerts", isAdmin, async (req, res) => {
    try {
      const alerts = await getInventoryAlerts();
      res.json(alerts);
    } catch (error) {
      console.error('Error fetching inventory alerts:', error);
      res.status(500).json({ 
        message: "Failed to get inventory alerts", 
        error: (error as Error).message 
      });
    }
  });
  
  // Generate a restock plan based on trends
  app.get("/api/inventory/restock-plan", isAdmin, async (req, res) => {
    try {
      const restockPlan = await generateRestockPlan();
      res.json(restockPlan);
    } catch (error) {
      console.error('Error generating restock plan:', error);
      res.status(500).json({ 
        message: "Failed to generate restock plan", 
        error: (error as Error).message 
      });
    }
  });
  
  // Product recommendation endpoint
  app.get("/api/recommendations", async (req, res) => {
    try {
      const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
      const category = req.query.category as string | undefined;
      const brand = req.query.brand as string | undefined;
      const type = req.query.type as string || 'similar';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 8;
      
      // Parse viewed products if provided
      let viewedProducts: number[] = [];
      if (req.query.viewedProducts) {
        try {
          viewedProducts = JSON.parse(req.query.viewedProducts as string);
          if (!Array.isArray(viewedProducts)) {
            viewedProducts = [];
          }
        } catch (e) {
          // Silently fail and use empty array
          viewedProducts = [];
        }
      }
      
      // Get all products first
      const allProducts = await storage.getProducts();
      let recommendations: any[] = [];
      
      // Different recommendation strategies based on type
      switch (type) {
        case 'similar':
          if (productId) {
            const product = await storage.getProduct(productId);
            if (product) {
              // Get products from same category, brand or similar price point
              recommendations = allProducts.filter(p => 
                p.id !== productId && (
                  (product.category && p.category === product.category) ||
                  (product.brand && p.brand === product.brand) ||
                  (product.price && Math.abs(p.price - product.price) < product.price * 0.3) // within 30% price range
                )
              );
            }
          } else if (category) {
            // If no specific product but category is provided
            recommendations = allProducts.filter(p => p.category === category);
          } else if (brand) {
            // If only brand is provided
            recommendations = allProducts.filter(p => p.brand === brand);
          }
          break;
          
        case 'popular':
          // Sort products by highest rated and/or most purchased
          recommendations = [...allProducts].sort((a, b) => {
            const aScore = (a.rating || 0) * 10 + (a.reviewCount || 0);
            const bScore = (b.rating || 0) * 10 + (b.reviewCount || 0);
            return bScore - aScore;
          });
          
          // Filter by category/brand if provided
          if (category) {
            recommendations = recommendations.filter(p => p.category === category);
          }
          if (brand) {
            recommendations = recommendations.filter(p => p.brand === brand);
          }
          break;
          
        case 'new':
          // Sort products by newest first (using id as a proxy for newer products if createdAt isn't available)
          recommendations = [...allProducts].sort((a, b) => b.id - a.id);
          
          // Filter by category/brand if provided
          if (category) {
            recommendations = recommendations.filter(p => p.category === category);
          }
          if (brand) {
            recommendations = recommendations.filter(p => p.brand === brand);
          }
          break;
          
        case 'user-history':
          // Based on user's previously viewed products
          if (viewedProducts.length > 0) {
            // Get the categories and brands of viewed products
            const viewedProductDetails = await Promise.all(
              viewedProducts.map(id => storage.getProduct(id))
            );
            
            const viewedCategories = new Set(viewedProductDetails.filter(Boolean).map(p => p?.category));
            const viewedBrands = new Set(viewedProductDetails.filter(Boolean).map(p => p?.brand));
            
            // Recommend products from same categories or brands, but not already viewed
            recommendations = allProducts.filter(p => 
              !viewedProducts.includes(p.id) && (
                (viewedCategories.size > 0 && p.category && viewedCategories.has(p.category)) ||
                (viewedBrands.size > 0 && p.brand && viewedBrands.has(p.brand))
              )
            );
          }
          break;
          
        case 'mixed':
          // Mixed strategy - some popular, some similar, some new
          const popularLimit = Math.floor(limit / 3);
          const similarLimit = Math.floor(limit / 3);
          const newLimit = limit - popularLimit - similarLimit;
          
          const popularItems = [...allProducts]
            .sort((a, b) => ((b.rating || 0) * 10 + (b.reviewCount || 0)) - ((a.rating || 0) * 10 + (a.reviewCount || 0)))
            .slice(0, popularLimit);
            
          const newItems = [...allProducts]
            .sort((a, b) => b.id - a.id)
            .slice(0, newLimit);
            
          let similarItems: any[] = [];
          if (productId) {
            const product = await storage.getProduct(productId);
            if (product) {
              similarItems = allProducts
                .filter(p => 
                  p.id !== productId && 
                  ((product.category && p.category === product.category) ||
                  (product.brand && p.brand === product.brand))
                )
                .slice(0, similarLimit);
            }
          }
          
          // Combine all types and remove duplicates by id
          const combinedRecommendations = [...popularItems, ...newItems, ...similarItems];
          const uniqueIds = new Set();
          recommendations = combinedRecommendations.filter(p => {
            if (uniqueIds.has(p.id)) return false;
            uniqueIds.add(p.id);
            return true;
          });
          break;
          
        default:
          // Default to similar
          recommendations = allProducts;
          if (category) {
            recommendations = recommendations.filter(p => p.category === category);
          }
          if (brand) {
            recommendations = recommendations.filter(p => p.brand === brand);
          }
      }
      
      // Limit the number of recommendations
      recommendations = recommendations.slice(0, limit);
      
      res.json(recommendations);
    } catch (err) {
      console.error("Error getting recommendations:", err);
      res.status(500).json({ message: "Failed to get recommendations" });
    }
  });
  app.get("/api/products", async (req, res) => {
    try {
      const { category, subcategory, brand, brandType, featured, isNewArrival, minPrice, maxPrice, inStock, search } = req.query;
      
      const options: any = {};
      
      if (category) options.category = category as string;
      if (subcategory) options.subcategory = subcategory as string;
      if (brand) options.brand = brand as string;
      if (brandType) options.brandType = brandType as string;
      if (featured) options.featured = featured === "true";
      if (isNewArrival) options.isNewArrival = isNewArrival === "true";
      if (minPrice) options.minPrice = parseFloat(minPrice as string);
      if (maxPrice) options.maxPrice = parseFloat(maxPrice as string);
      if (inStock) options.inStock = inStock === "true";
      if (search) options.search = search as string;
      
      const products = await storage.getProducts(options);
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products", error: (error as Error).message });
    }
  });
  
  // Get a single product by ID
  app.get("/api/products/:id", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      res.json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product", error: (error as Error).message });
    }
  });

  app.post("/api/products", isAdmin, async (req, res) => {
    try {
      const validationResult = insertProductSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      const product = await storage.createProduct(validationResult.data);
      res.status(201).json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to create product", error: (error as Error).message });
    }
  });
  
  // Upload single product image endpoint
  app.post("/api/products/upload", isAdmin, productUpload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }
      
      console.log('File upload debug - File received:', req.file);
      
      // Get product information from the request
      const productId = req.body.productId ? parseInt(req.body.productId) : null;
      const productName = req.body.productName || null;
      
      // Create relative path for the image based on directory structure
      const filePath = req.file.path;
      console.log('File upload debug - Original path:', filePath);
      
      // Fix path for Windows-style paths if present
      const normalizedPath = filePath.replace(/\\/g, '/');
      console.log('File upload debug - Normalized path:', normalizedPath);
      
      // Make sure we create a proper URL path, regardless of how the file was saved
      // This ensures compatibility across different environments
      let imageUrl;
      
      // Check if path starts with uploads/ or ./uploads/
      if (normalizedPath.startsWith('./uploads/')) {
        // Remove the leading dot to make it a relative URL path
        imageUrl = normalizedPath.substring(1); // Removes the dot: './uploads/...' -> '/uploads/...'
      } else if (normalizedPath.startsWith('uploads/')) {
        // Add the leading slash to make it a URL path
        imageUrl = '/' + normalizedPath;
      } else {
        // For absolute paths, extract just the filename and construct a new path
        const filename = path.basename(normalizedPath);
        const subdirMatch = normalizedPath.match(/products\/(.+?\/)?[^\/]+$/);
        const subdir = subdirMatch ? subdirMatch[1] || '' : '';
        imageUrl = `/uploads/products/${subdir}${filename}`;
      }
      
      console.log('File upload debug - Final image URL:', imageUrl);
      
      // If product ID is specified, update the product with this image
      if (productId) {
        try {
          const product = await storage.getProduct(productId);
          
          if (product) {
            // Add this image to the product's image array
            const updatedImages = [...(product.images || []), imageUrl];
            await storage.updateProduct(productId, { images: updatedImages });
            
            console.log(`Added image ${imageUrl} to product ${productId}`);
          }
        } catch (err) {
          console.error(`Error updating product with image: ${err}`);
          // Continue even if product update fails to at least return the image URL
        }
      }
      
      res.status(201).json({ 
        message: "Image uploaded successfully",
        imageUrl: imageUrl,
        productId,
        productName
      });
    } catch (error) {
      console.error("Error uploading product image:", error);
      res.status(500).json({ 
        message: "Failed to upload product image", 
        error: (error as Error).message 
      });
    }
  });
  
  // Upload multiple product images endpoint
  app.post("/api/products/upload-multiple", isAdmin, productUpload.array('images', 10), async (req, res) => {
    try {
      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ message: "No image files uploaded" });
      }
      
      console.log('Multiple file upload debug - Files received:', req.files);
      
      // Get product information from the request
      const productId = req.body.productId ? parseInt(req.body.productId) : null;
      const productName = req.body.productName || null;
      
      // Create relative paths for all images
      const imageUrls = (req.files as Express.Multer.File[]).map(file => {
        const filePath = file.path;
        console.log('Multiple file upload debug - Original path:', filePath);
        
        // Fix path for Windows-style paths if present
        const normalizedPath = filePath.replace(/\\/g, '/');
        console.log('Multiple file upload debug - Normalized path:', normalizedPath);
        
        // Make sure we create a proper URL path, regardless of how the file was saved
        let imageUrl;
        
        // Check if path starts with uploads/ or ./uploads/
        if (normalizedPath.startsWith('./uploads/')) {
          // Remove the leading dot to make it a relative URL path
          imageUrl = normalizedPath.substring(1); // Removes the dot: './uploads/...' -> '/uploads/...'
        } else if (normalizedPath.startsWith('uploads/')) {
          // Add the leading slash to make it a URL path
          imageUrl = '/' + normalizedPath;
        } else {
          // For absolute paths, extract just the filename and construct a new path
          const filename = path.basename(normalizedPath);
          const subdirMatch = normalizedPath.match(/products\/(.+?\/)?[^\/]+$/);
          const subdir = subdirMatch ? subdirMatch[1] || '' : '';
          imageUrl = `/uploads/products/${subdir}${filename}`;
        }
        
        console.log('Multiple file upload debug - Final image URL:', imageUrl);
        return imageUrl;
      });
      
      // If product ID is specified, update the product with these images
      if (productId) {
        try {
          const product = await storage.getProduct(productId);
          
          if (product) {
            // Add these images to the product's image array
            const updatedImages = [...(product.images || []), ...imageUrls];
            await storage.updateProduct(productId, { images: updatedImages });
            
            console.log(`Added ${imageUrls.length} images to product ${productId}`);
          }
        } catch (err) {
          console.error(`Error updating product with images: ${err}`);
          // Continue even if product update fails to at least return the image URLs
        }
      }
      
      res.status(201).json({ 
        message: "Images uploaded successfully",
        imageUrls: imageUrls,
        productId,
        productName,
        count: imageUrls.length
      });
    } catch (error) {
      console.error("Error uploading product images:", error);
      res.status(500).json({ 
        message: "Failed to upload product images", 
        error: (error as Error).message 
      });
    }
  });

  app.put("/api/products/:id", isAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const updatedProduct = await storage.updateProduct(productId, req.body);
      
      // Send real-time update to connected admin dashboards
      const products = await storage.getProducts();
      const lowStockProducts = products.filter(p => p.quantity < 10);
      broadcast({
        type: 'product_update',
        data: {
          productId,
          product: updatedProduct,
          lowStockProducts
        }
      });
      
      res.json(updatedProduct);
    } catch (error) {
      res.status(500).json({ message: "Failed to update product", error: (error as Error).message });
    }
  });

  app.delete("/api/products/:id", isAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      await storage.deleteProduct(productId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete product", error: (error as Error).message });
    }
  });
  
  // Barcode/SKU scanning endpoint
  app.get("/api/products/scan/:barcode", isAdmin, async (req, res) => {
    try {
      const { barcode } = req.params;
      
      // First try to find by barcode
      const products = await storage.getProducts();
      let product = products.find(p => p.barcode === barcode);
      
      // If not found by barcode, try SKU
      if (!product) {
        product = products.find(p => p.sku === barcode);
      }
      
      if (!product) {
        return res.status(404).json({ message: "Product not found with the given barcode/SKU" });
      }
      
      res.json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to scan product", error: (error as Error).message });
    }
  });
  
  // Generate barcode for a product
  app.post("/api/products/:id/generate-barcode", isAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Generate a unique barcode with DASH prefix and 10 random digits
      const barcode = `DASH${Math.floor(Math.random() * 10000000000).toString().padStart(10, '0')}`;
      
      // Update the product with the new barcode
      const updatedProduct = await storage.updateProduct(productId, { barcode });
      
      res.json({ barcode: updatedProduct.barcode });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate barcode", error: (error as Error).message });
    }
  });
  
  // Generate barcodes for all products that don't have one
  app.post("/api/products/generate-all-barcodes", isAdmin, async (req, res) => {
    try {
      const products = await storage.getProducts();
      const productsWithoutBarcodes = products.filter(p => !p.barcode);
      
      let updatedCount = 0;
      
      for (const product of productsWithoutBarcodes) {
        // Generate a unique barcode with DASH prefix and product ID + 8 random digits for uniqueness
        const barcode = `DASH${product.id.toString().padStart(4, '0')}${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
        
        // Update the product with the new barcode
        await storage.updateProduct(product.id, { barcode });
        updatedCount++;
      }
      
      res.json({ 
        message: `Generated barcodes for ${updatedCount} products`,
        updatedCount
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate barcodes", error: (error as Error).message });
    }
  });
  
  // Generate SKU for a product
  app.post("/api/products/:id/generate-sku", isAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Generate SKU based on product details
      // Format: [brand first 3 chars]-[category first 3 chars]-[product id]-[random 3 digits]
      const brandPrefix = product.brand.substring(0, 3).toUpperCase();
      const categoryPrefix = product.category.substring(0, 3).toUpperCase();
      const randomSuffix = Math.floor(Math.random() * 900 + 100); // 3-digit random number
      
      const sku = `${brandPrefix}-${categoryPrefix}-${product.id}-${randomSuffix}`;
      
      // Update product with new SKU
      const updatedProduct = await storage.updateProduct(productId, { sku });
      
      // Broadcast product update
      broadcast({
        type: 'product_update',
        data: {
          product: updatedProduct,
          action: 'updated'
        }
      });
      
      res.json({ sku, product: updatedProduct });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate SKU", error: (error as Error).message });
    }
  });
  
  // Update in-store inventory
  app.put("/api/products/:id/in-store-inventory", isAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Validate inventory data
      const schema = z.object({
        storeQuantity: z.number().int().min(0),
        inStoreAvailable: z.boolean().optional()
      });
      
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      // Default inStoreAvailable to true if quantity > 0
      const inStoreAvailable = req.body.inStoreAvailable !== undefined 
        ? req.body.inStoreAvailable 
        : validationResult.data.storeQuantity > 0;
      
      // Update product in-store inventory
      const updatedProduct = await storage.updateProduct(productId, { 
        storeQuantity: validationResult.data.storeQuantity,
        inStoreAvailable: inStoreAvailable
      });
      
      // Determine if this is an increase or decrease in inventory
      const previousQuantity = product.storeQuantity || 0;
      const newQuantity = validationResult.data.storeQuantity;
      const quantityChange = newQuantity - previousQuantity;
      const action = quantityChange > 0 ? 'increase' : 'decrease';
      
      // Broadcast inventory update
      broadcast({
        type: 'inventory_update',
        data: {
          productId: product.id,
          productName: product.name,
          action: action,
          change: quantityChange,
          newQuantity: newQuantity,
          inStore: true
        }
      });
      
      res.json(updatedProduct);
    } catch (error) {
      res.status(500).json({ message: "Failed to update in-store inventory", error: (error as Error).message });
    }
  });

  // Cart routes
  app.get("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const cartItems = await storage.getCartItemsByUserWithProducts(userId);
      res.json(cartItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cart items", error: (error as Error).message });
    }
  });

  app.post("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const validationResult = insertCartItemSchema.safeParse({ ...req.body, userId });
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      // Check if product exists and is in stock
      const product = await storage.getProduct(validationResult.data.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (!product.inStock || product.quantity < (validationResult.data.quantity || 1)) {
        return res.status(400).json({ message: "Product is out of stock or has insufficient quantity" });
      }
      
      const cartItem = await storage.addToCart(validationResult.data);
      const cartItemWithProduct = await storage.getCartItemWithProduct(cartItem.id);
      res.status(201).json(cartItemWithProduct);
    } catch (error) {
      res.status(500).json({ message: "Failed to add item to cart", error: (error as Error).message });
    }
  });

  app.put("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      const cartItemId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      // Validate quantity
      const quantitySchema = z.object({ quantity: z.number().int().positive() });
      const validationResult = quantitySchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      // Check if cart item exists and belongs to user
      const cartItem = await storage.getCartItem(cartItemId);
      if (!cartItem) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      
      if (cartItem.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Check if product has sufficient quantity
      const product = await storage.getProduct(cartItem.productId);
      if (!product || !product.inStock || product.quantity < (validationResult.data.quantity || 1)) {
        return res.status(400).json({ message: "Product is out of stock or has insufficient quantity" });
      }
      
      const updatedCartItem = await storage.updateCartItem(cartItemId, validationResult.data.quantity);
      const cartItemWithProduct = await storage.getCartItemWithProduct(updatedCartItem!.id);
      res.json(cartItemWithProduct);
    } catch (error) {
      res.status(500).json({ message: "Failed to update cart item", error: (error as Error).message });
    }
  });

  app.delete("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      const cartItemId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      // Check if cart item exists and belongs to user
      const cartItem = await storage.getCartItem(cartItemId);
      if (!cartItem) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      
      if (cartItem.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.removeFromCart(cartItemId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove item from cart", error: (error as Error).message });
    }
  });

  app.delete("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      await storage.clearCart(userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to clear cart", error: (error as Error).message });
    }
  });

  // Wishlist routes
  app.get("/api/wishlist", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const wishlistItems = await storage.getWishlistItemsByUserWithProducts(userId);
      res.json(wishlistItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wishlist items", error: (error as Error).message });
    }
  });

  app.post("/api/wishlist", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      
      // Validate productId
      const schema = z.object({ productId: z.number().int().positive() });
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      // Check if product exists
      const product = await storage.getProduct(validationResult.data.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const wishlistItem = await storage.addToWishlist({ userId, productId: validationResult.data.productId });
      res.status(201).json(wishlistItem);
    } catch (error) {
      res.status(500).json({ message: "Failed to add item to wishlist", error: (error as Error).message });
    }
  });

  app.delete("/api/wishlist/:id", isAuthenticated, async (req, res) => {
    try {
      const wishlistItemId = parseInt(req.params.id);
      await storage.removeFromWishlist(wishlistItemId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove item from wishlist", error: (error as Error).message });
    }
  });

  // Order routes
  // Generate a unique tracking number for orders
  function generateTrackingNumber(): string {
    // Format: DASH-YYYYMMDD-XXXXXX where XXXXXX is a random alphanumeric string
    const date = new Date();
    const dateStr = format(date, 'yyyyMMdd');
    // Generate a random alphanumeric string (upper-case letters and numbers)
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomStr = '';
    for (let i = 0; i < 6; i++) {
      randomStr += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return `DASH-${dateStr}-${randomStr}`;
  }

  app.post("/api/orders", isAuthenticated, async (req, res) => {
    try {
      console.log("Creating new authenticated order, request body:", req.body);
      const userId = (req.user as any).id;
      console.log("Authenticated user ID:", userId);
      
      // Get cart items
      const cartItems = await storage.getCartItemsByUserWithProducts(userId);
      console.log("Cart items for user:", cartItems.length);
      
      if (cartItems.length === 0) {
        console.log("Cart is empty for user:", userId);
        return res.status(400).json({ message: "Cart is empty" });
      }
      
      // Generate a unique tracking number for this order
      const trackingNumber = generateTrackingNumber();
      console.log("Generated tracking number:", trackingNumber);
      
      // Validate order data
      const orderData = {
        ...req.body,
        userId,
        trackingNumber, // Add tracking number to the order data
      };
      
      console.log("Validating order data:", orderData);
      const validationResult = insertOrderSchema.safeParse(orderData);
      if (!validationResult.success) {
        console.error("Order validation error:", validationResult.error.errors);
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      console.log("Creating order with data:", validationResult.data);
      // Create order
      const order = await storage.createOrder(validationResult.data);
      console.log("Order created successfully:", order.id, "with tracking number:", order.trackingNumber);
      
      // Create order items
      for (const cartItem of cartItems) {
        await storage.createOrderItem({
          orderId: order.id,
          productId: cartItem.productId,
          quantity: cartItem.quantity,
          price: cartItem.product.discountPrice || cartItem.product.price,
        });
        
        // Update product quantity
        const product = await storage.getProduct(cartItem.productId);
        if (product) {
          const newQuantity = product.quantity - cartItem.quantity;
          const inStock = newQuantity > 0;
          const updatedProduct = await storage.updateProduct(product.id, { quantity: newQuantity, inStock });
          
          // Broadcast product update if stock is low or out of stock
          if (newQuantity < 10) {
            broadcast({
              type: 'product_update',
              data: {
                productId: product.id,
                product: updatedProduct,
                lowStock: true
              }
            });
          }
        }
      }
      
      // Clear the cart
      await storage.clearCart(userId);
      
      const orderWithItems = await storage.getOrderWithItems(order.id);
      
      // Send real-time update to connected admin dashboards
      const ordersCount = (await storage.getOrders()).length;
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'order_update',
        data: {
          orderCount: ordersCount,
          recentOrders,
          newOrder: orderWithItems
        }
      });
      
      res.status(201).json(orderWithItems);
    } catch (error) {
      console.error("Error creating authenticated order:", error);
      res.status(500).json({ message: "Failed to create order", error: (error as Error).message });
    }
  });
  
  // Guest orders route - allows non-authenticated users to place orders
  app.post("/api/guest-orders", async (req, res) => {
    try {
      console.log("Creating new guest order, request body:", req.body);
      const { 
        cartItems, 
        shippingAddress, 
        totalAmount, 
        paymentMethod, 
        paymentStatus = "paid", 
        notes,
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        country
      } = req.body;
      
      if (!cartItems || cartItems.length === 0) {
        console.log("Guest cart is empty");
        return res.status(400).json({ message: "Cart is empty" });
      }
      
      console.log("Guest cart items:", cartItems.length);
      console.log("Guest shipping address:", shippingAddress);
      
      // Create a guest user for this order
      const guestUser = await storage.createUser({
        username: `guest_${Date.now()}`,
        email: email,
        password: Math.random().toString(36).substring(2, 15), // random password
        firstName: firstName,
        lastName: lastName,
        phone: phone,
        address: address,
        city: city,
        state: state,
        country: country,
        isAdmin: false
      });
      
      // Generate a tracking number for guest order
      const trackingNumber = generateTrackingNumber();
      console.log("Generated tracking number for guest order:", trackingNumber);
      
      // Create order for the guest user
      const order = await storage.createOrder({
        userId: guestUser.id,
        totalAmount,
        paymentMethod,
        paymentStatus,
        shippingAddress,
        status: "processing",
        trackingNumber,
        notes: notes || null
      });
      
      // Create order items from the cart items
      for (const cartItem of cartItems) {
        await storage.createOrderItem({
          orderId: order.id,
          productId: cartItem.product.id,
          quantity: cartItem.quantity,
          price: cartItem.product.discountPrice || cartItem.product.price,
        });
        
        // Update product quantity
        const product = await storage.getProduct(cartItem.product.id);
        if (product) {
          const newQuantity = product.quantity - cartItem.quantity;
          const inStock = newQuantity > 0;
          const updatedProduct = await storage.updateProduct(product.id, { quantity: newQuantity, inStock });
          
          // Broadcast product update if stock is low or out of stock
          if (newQuantity < 10) {
            broadcast({
              type: 'product_update',
              data: {
                productId: product.id,
                product: updatedProduct,
                lowStock: true
              }
            });
          }
        }
      }
      
      const orderWithItems = await storage.getOrderWithItems(order.id);
      
      // Send real-time update to connected admin dashboards for guest order
      const ordersCount = (await storage.getOrders()).length;
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'order_update',
        data: {
          orderCount: ordersCount,
          recentOrders,
          newOrder: orderWithItems
        }
      });
      
      res.status(201).json(orderWithItems);
    } catch (error) {
      console.error("Error creating guest order:", error);
      res.status(500).json({ message: "Failed to create guest order", error: (error as Error).message });
    }
  });

  app.get("/api/orders", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const isAdminUser = (req.user as any).isAdmin;
      const includeArchived = req.query.includeArchived === 'true';
      const includeItems = req.query.includeItems === 'true';
      
      // Handle date range filtering
      let fromDate: Date | undefined;
      let toDate: Date | undefined;
      
      if (req.query.fromDate) {
        fromDate = new Date(req.query.fromDate as string);
      }
      
      if (req.query.toDate) {
        toDate = new Date(req.query.toDate as string);
      }
      
      // If admin, return all orders (with optional filters), otherwise return user's orders
      let orders = isAdminUser 
        ? await storage.getOrders(undefined, includeArchived, fromDate, toDate) 
        : await storage.getOrders(userId, includeArchived, fromDate, toDate);
      
      // Filter by order type if requested (online vs in-store)
      const orderType = req.query.orderType as string;
      if (orderType && ['online', 'in-store'].includes(orderType)) {
        const isInStore = orderType === 'in-store';
        orders = orders.filter(order => order.isInStorePurchase === isInStore);
      }
      
      // Filter by admin ID if requested (for filtering sales by a specific admin)
      const adminId = req.query.adminId ? parseInt(req.query.adminId as string) : undefined;
      if (adminId) {
        orders = orders.filter(order => order.processingAdminId === adminId);
      }
      
      // If items are requested, fetch the full order details with items for each order
      if (includeItems) {
        const ordersWithItems = await Promise.all(
          orders.map(async (order) => {
            const orderWithItems = await storage.getOrderWithItems(order.id);
            return orderWithItems || order;
          })
        );
        return res.json(ordersWithItems);
      }
      
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch orders", error: (error as Error).message });
    }
  });

  // Get order by tracking number
  app.get("/api/orders/tracking/:trackingNumber", async (req, res) => {
    try {
      const trackingNumber = req.params.trackingNumber;
      
      // Get all orders
      const orders = await storage.getOrders();
      
      // Find order with matching tracking number
      const order = orders.find(order => order.trackingNumber === trackingNumber);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found with this tracking number" });
      }
      
      // Get full order details with items
      const orderWithItems = await storage.getOrderWithItems(order.id);
      
      if (!orderWithItems) {
        return res.status(404).json({ message: "Order details not found" });
      }
      
      // For tracking numbers, we're more permissive - anyone with the tracking number can see basic order details
      res.json(orderWithItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order by tracking number", error: (error as Error).message });
    }
  });

  app.get("/api/orders/:id", isAuthenticated, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const isAdminUser = (req.user as any).isAdmin;
      
      const order = await storage.getOrderWithItems(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Check if user has access to this order
      if (!isAdminUser && order.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order", error: (error as Error).message });
    }
  });
  

  app.put("/api/orders/:id/status", isAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      
      // Validate status
      const schema = z.object({ status: z.string() });
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      const updatedOrder = await storage.updateOrderStatus(orderId, validationResult.data.status);
      
      // Send real-time update to connected admin dashboards
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'order_status_update',
        data: {
          orderId,
          status: validationResult.data.status,
          recentOrders
        }
      });
      
      res.json(updatedOrder);
    } catch (error) {
      res.status(500).json({ message: "Failed to update order status", error: (error as Error).message });
    }
  });

  app.put("/api/orders/:id/delivery", isAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      
      // Validate delivery status
      const schema = z.object({ status: z.string() });
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      const updatedOrder = await storage.updateDeliveryStatus(orderId, validationResult.data.status);
      
      // Send real-time update to connected admin dashboards
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'delivery_status_update',
        data: {
          orderId,
          deliveryStatus: validationResult.data.status,
          recentOrders
        }
      });
      
      res.json(updatedOrder);
    } catch (error) {
      res.status(500).json({ message: "Failed to update delivery status", error: (error as Error).message });
    }
  });
  
  // Update tracking number for an order
  app.put("/api/orders/:id/tracking", isAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      
      // Validate tracking number
      const schema = z.object({ trackingNumber: z.string() });
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      const updatedOrder = await storage.updateTrackingNumber(orderId, validationResult.data.trackingNumber);
      
      // Send real-time update to connected admin dashboards
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'tracking_number_update',
        data: {
          orderId,
          trackingNumber: validationResult.data.trackingNumber,
          recentOrders
        }
      });
      
      res.json(updatedOrder);
    } catch (error) {
      res.status(500).json({ message: "Failed to update tracking number", error: (error as Error).message });
    }
  });

  // Admin endpoint to create orders directly (for phone/in-person orders)
  app.post("/api/admin/orders", isAdmin, async (req, res) => {
    try {
      // Generate tracking number if not provided
      if (!req.body.trackingNumber) {
        req.body.trackingNumber = generateTrackingNumber();
        console.log("Generated tracking number for admin-created order:", req.body.trackingNumber);
      }
      
      const validationResult = insertOrderSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      const order = await storage.createOrder(validationResult.data);
      
      // Create order items if provided
      if (req.body.items && Array.isArray(req.body.items)) {
        for (const item of req.body.items) {
          const orderItemData = {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            selectedColor: item.selectedColor || null,
            selectedSize: item.selectedSize || null
          };
          
          await storage.createOrderItem(orderItemData);
          
          // Update product quantity
          const product = await storage.getProduct(item.productId);
          if (product) {
            const newQuantity = Math.max(0, product.quantity - item.quantity);
            await storage.updateProduct(item.productId, { 
              quantity: newQuantity,
              inStock: newQuantity > 0
            });
          }
        }
      }
      
      // Broadcast order update
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'order_update',
        data: {
          recentOrders
        }
      });
      
      // Get order with items for response
      const orderWithItems = await storage.getOrderWithItems(order.id);
      res.status(201).json(orderWithItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to create order", error: (error as Error).message });
    }
  });

  // API endpoint to upload and process order image scans
  app.post("/api/orders/scan", isAdmin, orderUpload.single('orderImage'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }
      
      // Get the uploaded file path
      const filePath = req.file.path;
      const fileUrl = `/uploads/orders/${path.basename(filePath)}`;
      
      // Process order details from the form
      const { orderNote, customerName, customerEmail, customerPhone, shippingAddress } = req.body;
      
      // Create a new order with the image scan information
      const now = new Date();
      const expiryDate = new Date(now);
      expiryDate.setMonth(expiryDate.getMonth() + 3);
      
      // Generate tracking number for the scanned order
      const trackingNumber = generateTrackingNumber();
      console.log("Generated tracking number for scanned order:", trackingNumber);
      
      const orderData = {
        userId: null, // This is a scanned order, so no user ID
        totalAmount: parseFloat(req.body.totalAmount) || 0,
        status: 'processed',
        paymentStatus: req.body.paymentStatus || 'paid',
        paymentMethod: req.body.paymentMethod || 'in-person',
        shippingAddress: shippingAddress || 'In-store pickup',
        deliveryStatus: 'pending',
        customerName: customerName || 'Walk-in Customer',
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
        trackingNumber, // Add the generated tracking number
        notes: orderNote || `Scanned order document`,
        imageScan: fileUrl,
        adminCreated: true,
        archived: false
      };
      
      const order = await storage.createOrder(orderData);
      
      // Broadcast order update
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'order_update',
        data: {
          recentOrders
        }
      });
      
      res.status(201).json({
        message: "Order scan processed successfully",
        order,
        imagePath: fileUrl
      });
    } catch (error) {
      console.error("Error processing order scan:", error);
      res.status(500).json({ 
        message: "Failed to process order scan", 
        error: (error as Error).message 
      });
    }
  });
  
  // Admin maintenance endpoints
  
  // Archive expired orders (admin only)
  app.post("/api/admin/archive-expired-orders", isAdmin, async (req, res) => {
    try {
      const archivedCount = await storage.archiveExpiredOrders();
      
      // Send real-time update to connected admin dashboards
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'orders_archived',
        data: {
          count: archivedCount,
          recentOrders
        }
      });
      
      res.json({ 
        message: `Successfully archived ${archivedCount} expired orders`,
        archivedCount 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to archive expired orders", error: (error as Error).message });
    }
  });
  
  // Delete archived orders (admin only)
  app.post("/api/admin/delete-archived-orders", isAdmin, async (req, res) => {
    try {
      const deletedCount = await storage.deleteArchivedOrders();
      
      // Send real-time update to connected admin dashboards
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'orders_deleted',
        data: {
          count: deletedCount,
          recentOrders
        }
      });
      
      res.json({ 
        message: `Successfully deleted ${deletedCount} archived orders`,
        deletedCount 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete archived orders", error: (error as Error).message });
    }
  });
  
  // Update admin activity timestamp (used for tracking active admins)
  app.post("/api/admin/activity", isAdmin, async (req, res) => {
    try {
      const adminId = req.user!.id;
      
      // Update the admin's last active timestamp
      const updatedUser = await storage.updateAdminActivity(adminId);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "Admin user not found" });
      }
      
      res.json({ 
        success: true,
        lastActive: updatedUser.lastActive
      });
    } catch (error) {
      console.error("Error updating admin activity:", error);
      res.status(500).json({ 
        message: "Failed to update admin activity", 
        error: (error as Error).message 
      });
    }
  });
  
  // Endpoint for recording an admin processing an order
  app.post("/api/admin/order-processing/:orderId", isAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const adminId = req.user!.id;
      const adminName = req.user!.firstName && req.user!.lastName 
        ? `${req.user!.firstName} ${req.user!.lastName}`
        : req.user!.username;
      
      // Update the order with admin processing information
      const updatedOrder = await storage.updateOrderAdmin(orderId, adminId, adminName);
      
      if (!updatedOrder) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Broadcast an update for real-time dashboard
      const recentOrders = (await storage.getOrders()).slice(-5);
      broadcast({
        type: 'order_admin_updated',
        data: {
          order: updatedOrder,
          recentOrders
        }
      });
      
      res.json({
        success: true,
        order: updatedOrder
      });
    } catch (error) {
      console.error("Error updating order admin processing:", error);
      res.status(500).json({ 
        message: "Failed to update order processing", 
        error: (error as Error).message 
      });
    }
  });
  
  // Endpoint for creating temporary access tokens
  app.post("/api/admin/temp-access-tokens", isAdmin, async (req, res) => {
    try {
      const adminId = req.user!.id;
      const adminName = req.user!.firstName && req.user!.lastName 
        ? `${req.user!.firstName} ${req.user!.lastName}`
        : req.user!.username;
      
      // Validate input
      const validationResult = insertTempAccessTokenSchema.safeParse({
        ...req.body,
        createdBy: adminId,
        adminName: adminName
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validationResult.error.errors 
        });
      }
      
      // Generate a random token if not provided
      if (!validationResult.data.token) {
        const crypto = require('crypto');
        const randomBytes = crypto.randomBytes(32).toString('hex');
        validationResult.data.token = randomBytes;
      }
      
      // Create the token
      const token = await storage.createTempAccessToken(validationResult.data);
      
      res.status(201).json({
        success: true,
        token
      });
    } catch (error) {
      console.error("Error creating temporary access token:", error);
      res.status(500).json({ 
        message: "Failed to create temporary access token", 
        error: (error as Error).message 
      });
    }
  });
  
  // Endpoint for listing admin's temporary access tokens
  app.get("/api/admin/temp-access-tokens", isAdmin, async (req, res) => {
    try {
      const adminId = req.user!.id;
      
      // Get all tokens created by this admin
      const tokens = await storage.getAdminTempAccessTokens(adminId);
      
      res.json(tokens);
    } catch (error) {
      console.error("Error fetching temporary access tokens:", error);
      res.status(500).json({ 
        message: "Failed to fetch temporary access tokens", 
        error: (error as Error).message 
      });
    }
  });
  
  // Endpoint for invalidating a temporary access token
  app.post("/api/admin/temp-access-tokens/:token/invalidate", isAdmin, async (req, res) => {
    try {
      const tokenStr = req.params.token;
      
      // Invalidate the token
      const success = await storage.invalidateTempAccessToken(tokenStr);
      
      if (!success) {
        return res.status(404).json({ message: "Token not found or already invalid" });
      }
      
      res.json({
        success: true,
        message: "Token invalidated successfully"
      });
    } catch (error) {
      console.error("Error invalidating temporary access token:", error);
      res.status(500).json({ 
        message: "Failed to invalidate temporary access token", 
        error: (error as Error).message 
      });
    }
  });
  
  // Endpoint for cleaning up expired tokens
  app.post("/api/admin/temp-access-tokens/cleanup", isAdmin, async (req, res) => {
    try {
      // Clean up expired tokens
      const deletedCount = await storage.cleanupExpiredTokens();
      
      res.json({
        success: true,
        deletedCount,
        message: `Successfully deleted ${deletedCount} expired tokens`
      });
    } catch (error) {
      console.error("Error cleaning up expired tokens:", error);
      res.status(500).json({ 
        message: "Failed to clean up expired tokens", 
        error: (error as Error).message 
      });
    }
  });

  // Master Admin routes - for managing store personnel
  app.get("/api/admin/store-personnel", isOwner, async (req, res) => {
    try {
      const masterId = (req.user as any).id;
      const personnel = await storage.getAdminsByMaster(masterId);
      res.json(personnel);
    } catch (error) {
      console.error("Error fetching store personnel:", error);
      res.status(500).json({ 
        message: "Failed to fetch store personnel", 
        error: (error as Error).message 
      });
    }
  });
  
  app.get("/api/admin/all-admins", isOwner, async (req, res) => {
    try {
      const admins = await storage.getAllAdmins();
      res.json(admins);
    } catch (error) {
      console.error("Error fetching all admins:", error);
      res.status(500).json({ 
        message: "Failed to fetch all admin users", 
        error: (error as Error).message 
      });
    }
  });
  
  // Master Admin Activity Logs Route
  app.get("/api/master-admin/activity-logs", isOwner, async (req, res) => {
    try {
      const { 
        adminId, 
        search, 
        activityType, 
        startDate, 
        endDate, 
        page = 1,
        limit = 20
      } = req.query;
      
      const masterId = (req.user as any).id;
      let adminLogs: any[] = [];
      
      // Fetch all admins created by this master admin
      const personnelIds = (await storage.getAdminsByMaster(masterId)).map(admin => admin.id);
      
      // Get all activity logs
      const allLogs = await storage.getRecentAdminActivities(1000); // Get a large number of logs
      
      // Filter logs to only include ones from this master's personnel
      adminLogs = allLogs.filter(log => 
        personnelIds.includes(log.adminId) || log.adminId === masterId
      );
      
      // Apply filters
      if (adminId) {
        adminLogs = adminLogs.filter(log => log.adminId === parseInt(adminId as string));
      }
      
      if (search) {
        const searchLower = (search as string).toLowerCase();
        adminLogs = adminLogs.filter(log => 
          log.adminName.toLowerCase().includes(searchLower) ||
          log.activityType.toLowerCase().includes(searchLower) ||
          JSON.stringify(log.activityDetails).toLowerCase().includes(searchLower)
        );
      }
      
      if (activityType) {
        adminLogs = adminLogs.filter(log => log.activityType === activityType);
      }
      
      if (startDate) {
        const start = new Date(startDate as string);
        adminLogs = adminLogs.filter(log => new Date(log.timestamp) >= start);
      }
      
      if (endDate) {
        const end = new Date(endDate as string);
        adminLogs = adminLogs.filter(log => new Date(log.timestamp) <= end);
      }
      
      // Pagination
      const pageSize = parseInt(limit as string);
      const startIdx = (parseInt(page as string) - 1) * pageSize;
      const paginatedLogs = adminLogs.slice(startIdx, startIdx + pageSize);
      
      res.json(paginatedLogs);
    } catch (error) {
      console.error("Error fetching admin activity logs:", error);
      res.status(500).json({ 
        message: "Failed to fetch activity logs", 
        error: (error as Error).message 
      });
    }
  });
  
  // Master Admin Personnel Activity Logs for a specific admin
  app.get("/api/master-admin/personnel/:id/activity", isOwner, async (req, res) => {
    try {
      const personnelId = parseInt(req.params.id);
      const masterId = (req.user as any).id;
      
      // Check if this personnel belongs to the master admin
      const personnel = await storage.getUser(personnelId);
      if (!personnel || personnel.createdBy !== masterId) {
        return res.status(403).json({ message: "You do not have permission to view this personnel's activities" });
      }
      
      // Get all activities for this admin
      const activities = await storage.getAdminActivities(personnelId);
      
      res.json(activities);
    } catch (error) {
      console.error("Error fetching personnel activities:", error);
      res.status(500).json({ 
        message: "Failed to fetch personnel activities", 
        error: (error as Error).message 
      });
    }
  });
  
  // PUT route for updating personnel
  app.put("/api/admin/store-personnel/:id", isOwner, async (req, res) => {
    try {
      const personnelId = parseInt(req.params.id);
      const masterId = (req.user as any).id;
      
      // Verify the personnel belongs to this master admin
      const personnel = await storage.getUser(personnelId);
      if (!personnel || personnel.createdBy !== masterId) {
        return res.status(403).json({ message: "You do not have permission to edit this personnel" });
      }
      
      const schema = z.object({
        username: z.string().min(3),
        email: z.string().email(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional().nullable(),
        adminRole: z.enum(["staff", "manager"]).optional()
      });
      
      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }
      
      // Update the user
      const updatedUser = await storage.updateUser(personnelId, {
        ...validationResult.data,
        adminName: `${validationResult.data.firstName || personnel.firstName} ${validationResult.data.lastName || personnel.lastName}`
      });
      
      // Log the activity
      await storage.logAdminActivity({
        adminId: masterId,
        adminName: (req.user as any).adminName || (req.user as any).username,
        activityType: "update_personnel",
        activityDetails: {
          personnelId,
          personnelName: updatedUser?.username
        },
        timestamp: new Date(),
        success: true
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating store personnel:", error);
      res.status(500).json({ 
        message: "Failed to update store personnel", 
        error: (error as Error).message 
      });
    }
  });
  
  // PATCH route for toggling active status
  app.patch("/api/admin/store-personnel/:id/status", isOwner, async (req, res) => {
    try {
      const personnelId = parseInt(req.params.id);
      const masterId = (req.user as any).id;
      
      // Verify the personnel belongs to this master admin
      const personnel = await storage.getUser(personnelId);
      if (!personnel || personnel.createdBy !== masterId) {
        return res.status(403).json({ message: "You do not have permission to modify this personnel" });
      }
      
      const schema = z.object({
        isActive: z.boolean()
      });
      
      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        });
      }
      
      // Toggle active status
      let updatedUser;
      if (validationResult.data.isActive) {
        updatedUser = await storage.reactivateAdmin(personnelId);
      } else {
        updatedUser = await storage.deactivateAdmin(personnelId);
      }
      
      // Log the activity
      await storage.logAdminActivity({
        adminId: masterId,
        adminName: (req.user as any).adminName || (req.user as any).username,
        activityType: validationResult.data.isActive ? "activate_personnel" : "deactivate_personnel",
        activityDetails: {
          personnelId,
          personnelName: updatedUser?.username
        },
        timestamp: new Date(),
        success: true
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating personnel status:", error);
      res.status(500).json({ 
        message: "Failed to update personnel status", 
        error: (error as Error).message 
      });
    }
  });
  
  // DELETE route for removing personnel
  app.delete("/api/admin/store-personnel/:id", isOwner, async (req, res) => {
    try {
      const personnelId = parseInt(req.params.id);
      const masterId = (req.user as any).id;
      
      // Verify the personnel belongs to this master admin
      const personnel = await storage.getUser(personnelId);
      if (!personnel || personnel.createdBy !== masterId) {
        return res.status(403).json({ message: "You do not have permission to delete this personnel" });
      }
      
      // Delete the user
      const deleted = await storage.deleteUser(personnelId);
      
      // Log the activity
      await storage.logAdminActivity({
        adminId: masterId,
        adminName: (req.user as any).adminName || (req.user as any).username,
        activityType: "delete_personnel",
        activityDetails: {
          personnelId,
          personnelName: personnel.username
        },
        timestamp: new Date(),
        success: deleted
      });
      
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error deleting store personnel:", error);
      res.status(500).json({ 
        message: "Failed to delete store personnel", 
        error: (error as Error).message 
      });
    }
  });
  
  app.post("/api/admin/store-personnel", isOwner, async (req, res) => {
    try {
      const schema = z.object({
        username: z.string().min(3),
        password: z.string().min(6),
        email: z.string().email(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional().nullable()
      });
      
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validationResult.error.errors 
        });
      }
      
      // Check if username or email already exists
      const existingUser = await storage.getUserByUsername(validationResult.data.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const existingEmail = await storage.getUserByEmail(validationResult.data.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
      
      // Create the store personnel
      const createdById = (req.user as any).id;
      const newPersonnel = await storage.createStorePersonnel(validationResult.data, createdById);
      
      // Remove sensitive information before sending the response
      const { password, ...personnelData } = newPersonnel;
      
      res.status(201).json({
        message: "Store personnel created successfully",
        user: personnelData
      });
    } catch (error) {
      console.error("Error creating store personnel:", error);
      res.status(500).json({ 
        message: "Failed to create store personnel", 
        error: (error as Error).message 
      });
    }
  });
  
  // Coupon routes
  app.post("/api/coupons/validate", async (req, res) => {
    try {
      // Validate code
      const schema = z.object({ code: z.string() });
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      const coupon = await storage.getCoupon(validationResult.data.code);
      
      if (!coupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }
      
      // Check if coupon is active
      if (!coupon.isActive) {
        return res.status(400).json({ message: "Coupon is inactive" });
      }
      
      // Check if coupon is expired
      if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
        return res.status(400).json({ message: "Coupon is expired" });
      }
      
      res.json(coupon);
    } catch (error) {
      res.status(500).json({ message: "Failed to validate coupon", error: (error as Error).message });
    }
  });

  app.post("/api/coupons", isAdmin, async (req, res) => {
    try {
      const validationResult = insertCouponSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ message: "Validation error", errors: validationResult.error.errors });
      }
      
      // Check if coupon code already exists
      const existingCoupon = await storage.getCoupon(validationResult.data.code);
      if (existingCoupon) {
        return res.status(400).json({ message: "Coupon code already exists" });
      }
      
      const coupon = await storage.createCoupon(validationResult.data);
      res.status(201).json(coupon);
    } catch (error) {
      res.status(500).json({ message: "Failed to create coupon", error: (error as Error).message });
    }
  });

  app.put("/api/coupons/:id", isAdmin, async (req, res) => {
    try {
      const couponId = parseInt(req.params.id);
      
      // Check if coupon exists by ID (we need to use the method from the interface)
      const existingCoupon = await storage.getCoupon(`coupon_${couponId}`); // Workaround since we don't have a getCouponById
      if (!existingCoupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }
      
      // Update coupon
      const updatedCoupon = await storage.updateCoupon(couponId, req.body);
      res.json(updatedCoupon);
    } catch (error) {
      res.status(500).json({ message: "Failed to update coupon", error: (error as Error).message });
    }
  });

  app.delete("/api/coupons/:id", isAdmin, async (req, res) => {
    try {
      const couponId = parseInt(req.params.id);
      
      // Check if coupon exists by ID (we need to use the method from the interface)
      const existingCoupon = await storage.getCoupon(`coupon_${couponId}`); // Workaround since we don't have a getCouponById
      if (!existingCoupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }
      
      // Delete coupon
      await storage.deleteCoupon(couponId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete coupon", error: (error as Error).message });
    }
  });

  // Public Order Tracking API (no authentication needed)
  app.get("/api/order-tracking/:id", async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const order = await storage.getOrderWithItems(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Return limited order information for public tracking
      const publicOrderInfo = {
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        trackingNumber: order.trackingNumber,
        deliveryStatus: order.deliveryStatus,
        items: order.items.map(item => ({
          id: item.id,
          product: {
            id: item.product.id,
            name: item.product.name,
            images: item.product.images,
          },
          quantity: item.quantity,
          price: item.price
        })),
        totalAmount: order.totalAmount
      };
      
      res.json(publicOrderInfo);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order", error: (error as Error).message });
    }
  });

  // Access check with temporary token
  app.get("/api/access/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      // Validate the token
      const validToken = await storage.getTempAccessToken(token);
      
      if (!validToken) {
        return res.status(404).json({ 
          success: false,
          message: "Access token not found or expired" 
        });
      }
      
      // Token is valid - return basic information without marking as used
      res.json({
        success: true,
        email: validToken.email,
        createdAt: validToken.createdAt,
        expiresAt: validToken.expiresAt,
        isActive: validToken.isActive
      });
    } catch (error) {
      console.error("Error validating access token:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to validate access token", 
        error: (error as Error).message 
      });
    }
  });
  
  // Mark a temporary token as used
  app.post("/api/access/:token/use", async (req, res) => {
    try {
      const { token } = req.params;
      
      // Mark token as used
      const updatedToken = await storage.markTempAccessTokenUsed(token);
      
      if (!updatedToken) {
        return res.status(404).json({ 
          success: false,
          message: "Access token not found or already used" 
        });
      }
      
      res.json({
        success: true,
        token: updatedToken
      });
    } catch (error) {
      console.error("Error marking access token as used:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to mark access token as used", 
        error: (error as Error).message 
      });
    }
  });
  
  // Get orders needing delivery notification
  app.get("/api/delivery-notifications", async (req, res) => {
    try {
      // This endpoint returns orders that need delivery notifications
      const ordersNeedingNotification = await storage.getOrdersNeedingNotification();
      
      res.json(ordersNeedingNotification);
    } catch (error) {
      console.error("Error fetching orders needing notification:", error);
      res.status(500).json({ 
        message: "Failed to fetch notification data", 
        error: (error as Error).message 
      });
    }
  });
  
  // Mark order as notified
  app.post("/api/delivery-notifications/:orderId", async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      
      // Update the order notification timestamp
      const updatedOrder = await storage.updateOrderNotification(orderId);
      
      if (!updatedOrder) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      res.json({
        success: true,
        order: updatedOrder
      });
    } catch (error) {
      console.error("Error updating order notification:", error);
      res.status(500).json({ 
        message: "Failed to update order notification", 
        error: (error as Error).message 
      });
    }
  });
  
  // Shipment Tracking API (no authentication needed)
  app.get("/api/shipments/:trackingNumber", async (req, res) => {
    try {
      const { trackingNumber } = req.params;
      
      // Find order with this tracking number
      const orders = await storage.getOrders();
      const order = orders.find(o => o.trackingNumber === trackingNumber);
      
      if (!order) {
        return res.status(404).json({ message: "Shipment not found" });
      }
      
      // Mock shipment data for demonstration
      // In a real application, this would come from a shipping carrier's API
      const mockShipmentData = {
        trackingNumber,
        status: order.deliveryStatus || "processing",
        estimatedDelivery: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days from now
        carrier: "DASH Express",
        currentLocation: "Port Harcourt Distribution Center",
        history: [
          {
            status: "delivered",
            location: "1 Brooks Stone Close, GRA, Port Harcourt, Rivers, Nigeria",
            timestamp: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
            description: "Package delivered"
          },
          {
            status: "out_for_delivery",
            location: "Local Delivery Center",
            timestamp: new Date(new Date().getTime() + 2.8 * 24 * 60 * 60 * 1000).toISOString(), // 2.8 days from now
            description: "Out for delivery"
          },
          {
            status: "in_transit",
            location: "Port Harcourt Distribution Center",
            timestamp: new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
            description: "Package in transit to destination"
          },
          {
            status: "processing",
            location: "DASH Warehouse",
            timestamp: new Date(new Date().getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day from now
            description: "Package processed"
          },
          {
            status: "order_placed",
            location: "DASH Headquarters",
            timestamp: new Date().toISOString(), // Now
            description: "Order confirmed"
          }
        ]
      };
      
      res.json(mockShipmentData);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shipment", error: (error as Error).message });
    }
  });

  // Recommendations API
  app.get("/api/recommendations", async (req, res) => {
    try {
      const { productId, category, brand, limit = 6, viewedProducts } = req.query;
      const userId = req.isAuthenticated() ? (req.user as any).id : null;
      
      // Parse limit to number
      const limitNum = parseInt(limit as string) || 6;
      
      // Parse viewed products if available
      let viewedProductIds: number[] = [];
      if (viewedProducts) {
        try {
          viewedProductIds = JSON.parse(viewedProducts as string).map(Number);
        } catch (e) {
          console.error("Error parsing viewed products:", e);
        }
      }
      
      // Create recommendations based on different strategies
      
      // Strategy 1: If productId is provided, find similar products (same category and brand)
      if (productId) {
        const currentProduct = await storage.getProduct(parseInt(productId as string));
        
        if (currentProduct) {
          const similarProducts = await storage.getProducts({
            category: currentProduct.category,
            brand: currentProduct.brand,
          });
          
          // Filter out current product and limit results
          const recommendations = similarProducts
            .filter(p => p.id !== parseInt(productId as string))
            .slice(0, limitNum);
          
          return res.json(recommendations);
        }
      }
      
      // Strategy 2: If category is provided, get products from same category
      if (category) {
        const categoryProducts = await storage.getProducts({
          category: category as string,
          inStock: true,
        });
        
        return res.json(categoryProducts.slice(0, limitNum));
      }
      
      // Strategy 3: If brand is provided, get products from same brand
      if (brand) {
        const brandProducts = await storage.getProducts({
          brand: brand as string,
          inStock: true,
        });
        
        return res.json(brandProducts.slice(0, limitNum));
      }
      
      // Strategy 4: If user has viewed products, get recommendations based on those
      if (viewedProductIds.length > 0) {
        // Get categories and brands of viewed products
        const viewedProductsDetails = await Promise.all(
          viewedProductIds.map(id => storage.getProduct(id))
        );
        
        // Extract unique categories and brands
        const categories = new Set<string>();
        const brands = new Set<string>();
        
        viewedProductsDetails.forEach(product => {
          if (product) {
            categories.add(product.category);
            brands.add(product.brand);
          }
        });
        
        // Get products from these categories and brands
        const recommendedProducts = await storage.getProducts({
          inStock: true,
        });
        
        // Score products based on matching categories and brands
        const scoredProducts = recommendedProducts.map(product => {
          let score = 0;
          if (categories.has(product.category)) score += 2;
          if (brands.has(product.brand)) score += 1;
          
          // Penalize products that have already been viewed
          if (viewedProductIds.includes(product.id)) {
            score -= 5;
          }
          
          // Boost score for featured products
          if (product.featured) score += 1;
          
          // Boost score for new arrivals
          if (product.isNewArrival) score += 1;
          
          return { product, score };
        });
        
        // Sort by score and return top recommendations
        const recommendations = scoredProducts
          .sort((a, b) => b.score - a.score)
          .map(item => item.product)
          .slice(0, limitNum);
        
        return res.json(recommendations);
      }
      
      // Strategy 5: Fallback to featured or new arrival products
      const featuredProducts = await storage.getProducts({
        featured: true,
        inStock: true,
      });
      
      if (featuredProducts.length >= limitNum) {
        return res.json(featuredProducts.slice(0, limitNum));
      }
      
      const newArrivals = await storage.getProducts({
        isNewArrival: true,
        inStock: true,
      });
      
      // Combine featured and new arrivals if needed
      const combined = [...featuredProducts];
      
      for (const product of newArrivals) {
        if (!combined.some(p => p.id === product.id) && combined.length < limitNum) {
          combined.push(product);
        }
      }
      
      // If still not enough, get random products
      if (combined.length < limitNum) {
        const allProducts = await storage.getProducts({ inStock: true });
        
        for (const product of allProducts) {
          if (!combined.some(p => p.id === product.id) && combined.length < limitNum) {
            combined.push(product);
          }
        }
      }
      
      res.json(combined.slice(0, limitNum));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recommendations", error: (error as Error).message });
    }
  });

  // Deposit API routes for in-store items and partial payments
  
  // Get all deposits with optional filtering
  app.get("/api/deposits", isAdmin, async (req, res) => {
    try {
      const { adminId, customerId, status, productId } = req.query;
      
      // Convert query parameters to their proper types
      const filters: { 
        adminId?: number; 
        customerId?: number; 
        status?: string; 
        productId?: number 
      } = {};
      
      if (adminId) filters.adminId = parseInt(adminId as string);
      if (customerId) filters.customerId = parseInt(customerId as string);
      if (status) filters.status = status as string;
      if (productId) filters.productId = parseInt(productId as string);
      
      const deposits = await storage.getDeposits(filters);
      res.json(deposits);
    } catch (error) {
      console.error("Error fetching deposits:", error);
      res.status(500).json({ message: "Server error fetching deposits" });
    }
  });
  
  // Get a specific deposit by ID
  app.get("/api/deposits/:id", isAdmin, async (req, res) => {
    try {
      const depositId = parseInt(req.params.id);
      const deposit = await storage.getDepositWithProduct(depositId);
      
      if (!deposit) {
        return res.status(404).json({ message: "Deposit not found" });
      }
      
      res.json(deposit);
    } catch (error) {
      console.error("Error fetching deposit:", error);
      res.status(500).json({ message: "Server error fetching deposit details" });
    }
  });
  
  // Create a new deposit
  app.post("/api/deposits", isAdmin, async (req, res) => {
    try {
      const adminUser = req.user as any;
      
      // Validate deposit data
      const schema = z.object({
        customerName: z.string().min(2),
        customerEmail: z.string().email().optional().nullable(),
        customerPhone: z.string().min(5),
        productId: z.number(),
        productName: z.string(),
        totalPrice: z.number().positive(),
        depositAmount: z.number().positive(),
        remainingAmount: z.number().nonnegative(),
        paymentMethod: z.string(),
        customerId: z.number().optional().nullable(),
        depositDate: z.date().optional(),
        expectedPickupDate: z.date().optional().nullable(),
        notes: z.string().optional().nullable(),
        status: z.string().optional()
      });
      
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validationResult.error.errors 
        });
      }
      
      // Add admin info to deposit
      const depositData = {
        ...validationResult.data,
        adminId: adminUser.id,
        adminName: adminUser.adminName || `${adminUser.firstName} ${adminUser.lastName}`
      };
      
      const deposit = await storage.createDeposit(depositData);
      
      // Update admin activity timestamp
      await storage.updateAdminActivity(adminUser.id);
      
      // Broadcast the deposit creation to admin dashboard
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'deposit_created',
            data: {
              deposit,
              timestamp: new Date(),
              message: `New deposit created for ${deposit.customerName}`
            }
          }));
        }
      });
      
      res.status(201).json(deposit);
    } catch (error) {
      console.error("Error creating deposit:", error);
      res.status(500).json({ message: "Server error creating deposit" });
    }
  });
  
  // Update deposit status
  app.put("/api/deposits/:id/status", isAdmin, async (req, res) => {
    try {
      const depositId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }
      
      const deposit = await storage.updateDepositStatus(depositId, status);
      
      if (!deposit) {
        return res.status(404).json({ message: "Deposit not found" });
      }
      
      // Update admin activity
      await storage.updateAdminActivity((req.user as any).id);
      
      // Broadcast the status change
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'deposit_status_updated',
            data: {
              deposit,
              timestamp: new Date(),
              message: `Deposit status updated to ${status}`
            }
          }));
        }
      });
      
      res.json(deposit);
    } catch (error) {
      console.error("Error updating deposit status:", error);
      res.status(500).json({ message: "Server error updating deposit status" });
    }
  });
  
  // Complete a deposit (customer paid remaining amount)
  app.put("/api/deposits/:id/complete", isAdmin, async (req, res) => {
    try {
      const depositId = parseInt(req.params.id);
      const { paymentMethod } = req.body;
      
      if (!paymentMethod) {
        return res.status(400).json({ message: "Payment method is required" });
      }
      
      const deposit = await storage.completeDeposit(depositId, { 
        paymentMethod, 
        completedAt: new Date() 
      });
      
      if (!deposit) {
        return res.status(404).json({ message: "Deposit not found" });
      }
      
      // Update admin activity and increment sales count
      await storage.updateAdminActivity((req.user as any).id);
      
      // Broadcast the completion
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'deposit_completed',
            data: {
              deposit,
              timestamp: new Date(),
              message: `Deposit for ${deposit.customerName} has been completed`
            }
          }));
        }
      });
      
      res.json(deposit);
    } catch (error) {
      console.error("Error completing deposit:", error);
      res.status(500).json({ message: "Server error completing deposit" });
    }
  });
  
  // Process a refund for a deposit
  app.put("/api/deposits/:id/refund", isAdmin, async (req, res) => {
    try {
      const depositId = parseInt(req.params.id);
      const { refundAmount, refundReason } = req.body;
      
      if (!refundAmount || !refundReason) {
        return res.status(400).json({ message: "Refund amount and reason are required" });
      }
      
      const deposit = await storage.processRefund(depositId, {
        refundAmount: parseFloat(refundAmount),
        refundReason,
        refundedAt: new Date()
      });
      
      if (!deposit) {
        return res.status(404).json({ message: "Deposit not found" });
      }
      
      // Update admin activity
      await storage.updateAdminActivity((req.user as any).id);
      
      // Broadcast the refund
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'deposit_refunded',
            data: {
              deposit,
              timestamp: new Date(),
              message: `Refund processed for ${deposit.customerName}`
            }
          }));
        }
      });
      
      res.json(deposit);
    } catch (error) {
      console.error("Error processing refund:", error);
      res.status(500).json({ message: "Server error processing refund" });
    }
  });
  
  // Create in-store order by admin
  app.post("/api/in-store-orders", isSalesOrAdmin, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { items, customerInfo, paymentMethod, notes } = req.body;
      
      if (!items || !items.length || !customerInfo || !paymentMethod) {
        return res.status(400).json({ message: "Missing required order information" });
      }
      
      // Calculate total amount
      let totalAmount = 0;
      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(404).json({ message: `Product with ID ${item.productId} not found` });
        }
        
        if (product.quantity < item.quantity) {
          return res.status(400).json({ 
            message: `Insufficient stock for product: ${product.name}. Available: ${product.quantity}`
          });
        }
        
        // Use discounted price if available
        const productPrice = product.discountPrice || product.price;
        totalAmount += productPrice * item.quantity;
      }
      
      // Create the order
      const order = await storage.createOrder({
        userId: null, // No user ID for in-store orders
        totalAmount,
        paymentMethod,
        paymentStatus: "completed", // In-store orders are paid immediately
        status: "completed", // In-store orders are completed immediately
        shippingAddress: customerInfo.address || "In-store purchase",
        customerName: customerInfo.name,
        customerEmail: customerInfo.email || null,
        customerPhone: customerInfo.phone || null,
        notes: notes || null,
        adminCreated: true,
        isInStorePurchase: true, // Mark as in-store purchase
        processingAdminId: req.user.id,
        processingAdminName: req.user.adminName || req.user.username
      });
      
      // Create order items
      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) continue; // Skip if product not found (unlikely at this point)
        
        // Create order item
        await storage.createOrderItem({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          price: product.discountPrice || product.price
        });
        
        // Update product inventory
        await storage.updateProduct(item.productId, {
          quantity: product.quantity - item.quantity
        });
      }
      
      // Log this activity
      await storage.logAdminActivity({
        adminId: req.user.id,
        adminName: req.user.adminName || req.user.username,
        activityType: "create_in_store_order",
        activityDetails: {
          orderId: order.id,
          totalAmount,
          customerName: customerInfo.name
        },
        timestamp: new Date(),
        success: true
      });
      
      // Update admin sales statistics
      await storage.incrementAdminSalesCount(req.user.id, totalAmount);
      
      // Broadcast the in-store order
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'in_store_order_created',
            data: {
              order,
              timestamp: new Date(),
              message: `In-store order created by ${req.user?.adminName || req.user?.username}`
            }
          }));
        }
      });
      
      // Return the created order
      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating in-store order:", error);
      res.status(500).json({ message: "Failed to create in-store order", error: (error as Error).message });
    }
  });

  // Super Admin API Routes
  
  // Create a super admin
  app.post("/api/super-admin/create", isAuthenticated, async (req, res) => {
    try {
      // Only allow master admin to create super admin accounts
      if (!req.user || !req.user.isMasterAdmin) {
        return res.status(403).json({ message: "Only master admins can create super admin accounts" });
      }
      
      const { username, email, password, firstName, lastName } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username) || await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Username or email already exists" });
      }
      
      // Create super admin
      const superAdmin = await storage.createSuperAdmin({
        username,
        email,
        password,
        firstName: firstName || null,
        lastName: lastName || null
      });
      
      // Log this activity
      await storage.logAdminActivity({
        adminId: req.user.id,
        adminName: req.user.adminName || req.user.username,
        activityType: "create_super_admin",
        activityDetails: {
          superAdminId: superAdmin.id,
          superAdminName: superAdmin.adminName || superAdmin.username
        },
        timestamp: new Date(),
        success: true
      });
      
      // Remove sensitive data before returning
      const { password: _, ...safeData } = superAdmin;
      
      res.status(201).json(safeData);
    } catch (error) {
      console.error("Error creating super admin:", error);
      res.status(500).json({ message: "Failed to create super admin", error: (error as Error).message });
    }
  });
  
  // Create a sub-admin (by super admin)
  app.post("/api/super-admin/sub-admin", isSuperAdmin, async (req, res) => {
    try {
      const { username, email, password, firstName, lastName, expiryDate } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username) || await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Username or email already exists" });
      }
      
      // Parse expiry date if provided
      let expiry = null;
      if (expiryDate) {
        expiry = new Date(expiryDate);
        if (isNaN(expiry.getTime())) {
          return res.status(400).json({ message: "Invalid expiry date format" });
        }
      }
      
      // Create sub-admin
      const subAdmin = await storage.createSubAdmin({
        username,
        email,
        password,
        firstName: firstName || null,
        lastName: lastName || null
      }, req.user.id, expiry);
      
      // Remove sensitive data before returning
      const { password: _, ...safeData } = subAdmin;
      
      res.status(201).json(safeData);
    } catch (error) {
      console.error("Error creating sub-admin:", error);
      res.status(500).json({ message: "Failed to create sub-admin", error: (error as Error).message });
    }
  });
  
  // Get all sub-admins
  app.get("/api/super-admin/sub-admins", isSuperAdmin, async (req, res) => {
    try {
      const subAdmins = await storage.getAllSubAdmins(req.user.id);
      
      // Remove sensitive data
      const safeData = subAdmins.map(admin => {
        const { password, ...rest } = admin;
        return rest;
      });
      
      res.json(safeData);
    } catch (error) {
      console.error("Error fetching sub-admins:", error);
      res.status(500).json({ message: "Failed to fetch sub-admins", error: (error as Error).message });
    }
  });
  
  // Set sub-admin expiration date
  app.put("/api/super-admin/sub-admin/:id/expire", isSuperAdmin, async (req, res) => {
    try {
      const subAdminId = parseInt(req.params.id);
      const { expiryDate } = req.body;
      
      if (!expiryDate) {
        return res.status(400).json({ message: "Expiry date is required" });
      }
      
      // Parse expiry date
      const expiry = new Date(expiryDate);
      if (isNaN(expiry.getTime())) {
        return res.status(400).json({ message: "Invalid expiry date format" });
      }
      
      // Verify this is a sub-admin created by this super admin
      const subAdmins = await storage.getAllSubAdmins(req.user.id);
      const isValidSubAdmin = subAdmins.some(admin => admin.id === subAdminId);
      
      if (!isValidSubAdmin) {
        return res.status(403).json({ message: "You can only manage sub-admins created by you" });
      }
      
      // Update expiry date
      const updatedAdmin = await storage.setAdminExpiration(subAdminId, expiry);
      
      if (!updatedAdmin) {
        return res.status(404).json({ message: "Sub-admin not found" });
      }
      
      // Log this activity
      await storage.logAdminActivity({
        adminId: req.user.id,
        adminName: req.user.adminName || req.user.username,
        activityType: "update_subadmin_expiry",
        activityDetails: {
          subAdminId,
          expiryDate: expiry.toISOString()
        },
        timestamp: new Date(),
        success: true
      });
      
      // Remove sensitive data
      const { password, ...safeData } = updatedAdmin;
      
      res.json(safeData);
    } catch (error) {
      console.error("Error updating sub-admin expiry:", error);
      res.status(500).json({ message: "Failed to update sub-admin expiry", error: (error as Error).message });
    }
  });
  
  // Deactivate a sub-admin
  app.put("/api/super-admin/sub-admin/:id/deactivate", isSuperAdmin, async (req, res) => {
    try {
      const subAdminId = parseInt(req.params.id);
      
      // Verify this is a sub-admin created by this super admin
      const subAdmins = await storage.getAllSubAdmins(req.user.id);
      const isValidSubAdmin = subAdmins.some(admin => admin.id === subAdminId);
      
      if (!isValidSubAdmin) {
        return res.status(403).json({ message: "You can only manage sub-admins created by you" });
      }
      
      const updatedAdmin = await storage.deactivateAdmin(subAdminId);
      
      if (!updatedAdmin) {
        return res.status(404).json({ message: "Sub-admin not found" });
      }
      
      // Log this activity
      await storage.logAdminActivity({
        adminId: req.user.id,
        adminName: req.user.adminName || req.user.username,
        activityType: "deactivate_subadmin",
        activityDetails: {
          subAdminId,
          subAdminName: updatedAdmin.adminName || updatedAdmin.username
        },
        timestamp: new Date(),
        success: true
      });
      
      // Remove sensitive data
      const { password, ...safeData } = updatedAdmin;
      
      res.json(safeData);
    } catch (error) {
      console.error("Error deactivating sub-admin:", error);
      res.status(500).json({ message: "Failed to deactivate sub-admin", error: (error as Error).message });
    }
  });
  
  // Reactivate a sub-admin
  app.put("/api/super-admin/sub-admin/:id/reactivate", isSuperAdmin, async (req, res) => {
    try {
      const subAdminId = parseInt(req.params.id);
      
      // Verify this is a sub-admin created by this super admin
      const subAdmins = await storage.getAllSubAdmins(req.user.id);
      const isValidSubAdmin = subAdmins.some(admin => admin.id === subAdminId);
      
      if (!isValidSubAdmin) {
        return res.status(403).json({ message: "You can only manage sub-admins created by you" });
      }
      
      const updatedAdmin = await storage.reactivateAdmin(subAdminId);
      
      if (!updatedAdmin) {
        return res.status(404).json({ message: "Sub-admin not found" });
      }
      
      // Log this activity
      await storage.logAdminActivity({
        adminId: req.user.id,
        adminName: req.user.adminName || req.user.username,
        activityType: "reactivate_subadmin",
        activityDetails: {
          subAdminId,
          subAdminName: updatedAdmin.adminName || updatedAdmin.username
        },
        timestamp: new Date(),
        success: true
      });
      
      // Remove sensitive data
      const { password, ...safeData } = updatedAdmin;
      
      res.json(safeData);
    } catch (error) {
      console.error("Error reactivating sub-admin:", error);
      res.status(500).json({ message: "Failed to reactivate sub-admin", error: (error as Error).message });
    }
  });
  
  // Get admin activity logs
  app.get("/api/super-admin/activity-logs", isSuperAdmin, async (req, res) => {
    try {
      const { adminId, limit } = req.query;
      
      let logs;
      
      if (adminId) {
        // Get logs for a specific admin
        logs = await storage.getAdminActivities(parseInt(adminId as string));
      } else {
        // Get recent logs across all admins
        logs = await storage.getRecentAdminActivities(
          limit ? parseInt(limit as string) : undefined
        );
      }
      
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs", error: (error as Error).message });
    }
  });
  
  // Get admin sales performance data
  app.get("/api/super-admin/performance", isSuperAdmin, async (req, res) => {
    try {
      const { adminId, startDate, endDate, period, top } = req.query;
      
      // Handle request for top performing admins
      if (top === 'true') {
        const topLimit = req.query.limit ? parseInt(req.query.limit as string) : 5;
        
        let start, end;
        if (startDate && endDate) {
          start = new Date(startDate as string);
          end = new Date(endDate as string);
          
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ message: "Invalid date format" });
          }
        }
        
        const topAdmins = await storage.getTopPerformingAdmins(
          topLimit,
          start,
          end
        );
        
        return res.json(topAdmins);
      }
      
      // Handle performance data for a specific admin
      if (!adminId) {
        return res.status(400).json({ message: "Admin ID is required" });
      }
      
      const adminIdNum = parseInt(adminId as string);
      
      // Get performance data based on period
      if (period === 'daily' && (startDate || endDate)) {
        const date = startDate ? new Date(startDate as string) : new Date();
        
        if (isNaN(date.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        
        const dailyPerformance = await storage.getAdminDailySalesPerformance(adminIdNum, date);
        return res.json(dailyPerformance || { adminId: adminIdNum, date, salesCount: 0, salesTotal: 0, ordersProcessed: 0, customersServed: 0, averageOrderValue: 0 });
      } 
      
      // Handle date range performance
      let start, end;
      
      if (startDate && endDate) {
        start = new Date(startDate as string);
        end = new Date(endDate as string);
      } else {
        // Default to last 30 days
        end = new Date();
        start = new Date();
        start.setDate(start.getDate() - 30);
      }
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      const performanceData = await storage.getAdminSalesPerformance(adminIdNum, start, end);
      res.json(performanceData);
      
    } catch (error) {
      console.error("Error fetching performance data:", error);
      res.status(500).json({ message: "Failed to fetch performance data", error: (error as Error).message });
    }
  });

  // Order Management API Routes
  // Get all orders with filtering options
  app.get('/api/orders', isAuthenticated, async (req, res) => {
    try {
      const { 
        orderType = 'all', 
        fromDate, 
        toDate, 
        includeItems = false,
        includeArchived = false 
      } = req.query;
      
      // Parse dates if provided
      const parsedFromDate = fromDate ? new Date(fromDate as string) : undefined;
      const parsedToDate = toDate ? new Date(toDate as string) : undefined;
      
      // Get user ID or admin ID for filtering based on role
      let userId: number | undefined;
      let adminId: number | undefined;
      
      if (req.user) {
        // If not admin, only return user's own orders
        if (!req.user.isAdmin) {
          userId = req.user.id;
        } 
        // If admin, filter based on their role and assignment
        else if (req.user.isAdmin) {
          // For regular admin, only show orders they processed
          if (!req.user.isMasterAdmin && !req.user.isSuperAdmin) {
            adminId = req.user.id;
          }
          // For master/super admin, show all orders (no filtering by admin)
        }
      }
      
      const orders = await storage.getOrders({
        userId,
        adminId,
        orderType: orderType as 'all' | 'online' | 'in-store',
        fromDate: parsedFromDate,
        toDate: parsedToDate,
        includeItems: includeItems === 'true',
        includeArchived: includeArchived === 'true'
      });
      
      res.json(orders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ error: 'Failed to retrieve orders' });
    }
  });
  
  // Create new in-store order (for store personnel and admins)
  app.post('/api/orders/in-store', isSalesOrAdmin, async (req, res) => {
    // Note: Permission check is already handled by isSalesOrAdmin middleware
    try {
      const orderData = insertOrderSchema.parse({
        ...req.body,
        isInStorePurchase: true,
        adminCreated: true,
        processingAdminId: req.user?.id,
        processingAdminName: req.user?.adminName || req.user?.username,
      });
      
      // Create the order
      const order = await storage.createOrder(orderData);
      
      // Create order items
      if (req.body.items && Array.isArray(req.body.items)) {
        for (const item of req.body.items) {
          const orderItem = insertOrderItemSchema.parse({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price
          });
          
          await storage.createOrderItem(orderItem);
          
          // Update product inventory
          const product = await storage.getProduct(item.productId);
          if (product) {
            const newStoreQuantity = Math.max(0, (product.storeQuantity || 0) - item.quantity);
            const updatedProduct = await storage.updateProduct(product.id, { storeQuantity: newStoreQuantity });
            
            // Broadcast inventory update
            broadcast({
              type: 'inventory_update',
              data: {
                productId: product.id,
                productName: product.name,
                action: 'decrease',
                change: -item.quantity,
                newQuantity: newStoreQuantity
              }
            });
          }
        }
      }
      
      // Record admin activity
      if (req.user) {
        await storage.logAdminActivity({
          adminId: req.user.id,
          adminName: req.user.adminName || req.user.username,
          activityType: 'create_in_store_order',
          activityDetails: {
            orderId: order.id,
            totalAmount: order.totalAmount,
            customerName: order.customerName
          },
          timestamp: new Date(),
          success: true
        });
        
        // Update admin's sales performance
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        await storage.createOrUpdateAdminSalesPerformance({
          adminId: req.user.id,
          adminName: req.user.adminName || req.user.username,
          date: today,
          salesCount: 1,
          salesTotal: orderData.totalAmount,
          ordersProcessed: 1,
          customersServed: 1,
          // Average will be calculated in the storage method
          averageOrderValue: 0
        });
      }
      
      // Broadcast order update to connected clients
      const updateMessage = {
        type: 'new_order',
        data: {
          order,
          isInStore: true,
          adminName: req.user?.adminName || req.user?.username
        }
      };
      broadcast(updateMessage);
      
      res.status(201).json(order);
    } catch (error) {
      console.error('Error creating in-store order:', error);
      res.status(500).json({ error: 'Failed to create in-store order' });
    }
  });
  
  // Get a specific order by ID
  app.get('/api/orders/:id', isAuthenticated, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      
      const order = await storage.getOrderWithItems(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Check if the user has permission to view this order
      if (!req.user?.isAdmin && order.userId !== req.user?.id) {
        return res.status(403).json({ error: 'Unauthorized to view this order' });
      }
      
      res.json(order);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ error: 'Failed to retrieve order' });
    }
  });
  
  // Update order status (admin only)
  app.patch('/api/orders/:id/status', isAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }
      
      const order = await storage.updateOrderStatus(orderId, status);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Record admin activity
      if (req.user) {
        await storage.logAdminActivity({
          adminId: req.user.id,
          adminName: req.user.adminName || req.user.username,
          activityType: 'update_order_status',
          activityDetails: {
            orderId,
            oldStatus: order.status,
            newStatus: status
          },
          timestamp: new Date(),
          success: true
        });
      }
      
      // Broadcast order status update
      const updateMessage = {
        type: 'order_status_update',
        data: {
          orderId,
          newStatus: status,
          adminName: req.user?.adminName || req.user?.username
        }
      };
      broadcast(updateMessage);
      
      res.json(order);
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  });
  
  // Update delivery status (admin only)
  app.patch('/api/orders/:id/delivery', isAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Delivery status is required' });
      }
      
      const order = await storage.updateDeliveryStatus(orderId, status);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Record admin activity
      if (req.user) {
        await storage.logAdminActivity({
          adminId: req.user.id,
          adminName: req.user.adminName || req.user.username,
          activityType: 'update_delivery_status',
          activityDetails: {
            orderId,
            oldStatus: order.deliveryStatus,
            newStatus: status
          },
          timestamp: new Date(),
          success: true
        });
      }
      
      // Broadcast delivery status update
      const updateMessage = {
        type: 'order_status_update',
        data: {
          orderId,
          newStatus: status,
          deliveryUpdate: true,
          adminName: req.user?.adminName || req.user?.username
        }
      };
      broadcast(updateMessage);
      
      res.json(order);
    } catch (error) {
      console.error('Error updating delivery status:', error);
      res.status(500).json({ error: 'Failed to update delivery status' });
    }
  });
  
  // Update payment status (admin only)
  app.patch('/api/orders/:id/payment-status', isAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      
      const { paymentStatus } = req.body;
      if (!paymentStatus) {
        return res.status(400).json({ error: 'Payment status is required' });
      }
      
      // Validate payment status value
      const validPaymentStatuses = ['pending', 'paid', 'refunded', 'failed'];
      if (!validPaymentStatuses.includes(paymentStatus)) {
        return res.status(400).json({ error: 'Invalid payment status' });
      }
      
      const order = await storage.updatePaymentStatus(orderId, paymentStatus);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Broadcast order update for real-time updates
      broadcastOrderUpdate();
      
      res.json(order);
    } catch (error) {
      console.error('Failed to update payment status:', error);
      res.status(500).json({ error: 'Failed to update payment status' });
    }
  });
  
  // Set tracking number (admin only)
  app.patch('/api/orders/:id/tracking', isAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      
      const { trackingNumber } = req.body;
      if (!trackingNumber) {
        return res.status(400).json({ error: 'Tracking number is required' });
      }
      
      const order = await storage.updateTrackingNumber(orderId, trackingNumber);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Record admin activity
      if (req.user) {
        await storage.logAdminActivity({
          adminId: req.user.id,
          adminName: req.user.adminName || req.user.username,
          activityType: 'update_tracking_number',
          activityDetails: {
            orderId,
            trackingNumber
          },
          timestamp: new Date(),
          success: true
        });
      }
      
      res.json(order);
    } catch (error) {
      console.error('Error updating tracking number:', error);
      res.status(500).json({ error: 'Failed to update tracking number' });
    }
  });
  // -- End of order routes

  // Create the HTTP server
  // Payment API routes
  app.post("/api/payment/initialize", async (req, res) => {
    try {
      await initializePayment(req, res);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: `Payment initialization failed: ${(error as Error).message}` 
      });
    }
  });
  
  app.get("/api/payment/verify", async (req, res) => {
    try {
      await verifyPayment(req, res);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: `Payment verification failed: ${(error as Error).message}` 
      });
    }
  });
  
  app.post("/api/payment/process-partial", isAuthenticated, async (req, res) => {
    try {
      const { orderId, amountPaid, reference, gateway, transactionId } = req.body;
      
      if (!orderId || !amountPaid || !reference || !gateway || !transactionId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields"
        });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }
      
      const result = await processPartialPayment(
        orderId, 
        amountPaid, 
        order.totalAmount,
        gateway,
        reference,
        transactionId
      );
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      // Update order in database
      if (result.updatedOrder) {
        await storage.updateOrder(orderId, {
          paymentStatus: result.updatedOrder.paymentStatus,
          amountPaid: result.updatedOrder.amountPaid,
          balanceAmount: result.updatedOrder.balanceAmount,
          paymentReference: result.updatedOrder.paymentReference,
          paymentTransactionId: result.updatedOrder.paymentTransactionId,
          paymentGateway: result.updatedOrder.paymentGateway,
          updatedAt: new Date()
        });
      }
      
      // Broadcast update to all connected clients
      broadcastOrderUpdate();
      
      return res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: `Partial payment processing failed: ${(error as Error).message}` 
      });
    }
  });
  
  // Shipment tracking API routes
  app.get("/api/shipments/:trackingNumber", async (req, res) => {
    try {
      const { trackingNumber } = req.params;
      
      // Get order by tracking number
      const order = await storage.getOrderByTrackingNumber(trackingNumber);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Shipment not found"
        });
      }
      
      // Format shipment response
      const shipment = {
        trackingNumber: order.trackingNumber,
        status: order.deliveryStatus || "processing",
        estimatedDelivery: order.estimatedDeliveryDate,
        currentLocation: order.shipmentEvents && order.shipmentEvents.length > 0 
          ? order.shipmentEvents[0].location 
          : "Processing center",
        courierName: order.courierName,
        courierTrackingUrl: order.courierTrackingUrl,
        events: order.shipmentEvents || [],
        lastUpdated: order.lastUpdated || order.updatedAt
      };
      
      res.json(shipment);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: `Failed to fetch shipment information: ${(error as Error).message}` 
      });
    }
  });
  
  // Update shipment tracking information
  app.post("/api/shipments/:trackingNumber", isAdmin, async (req, res) => {
    try {
      const { trackingNumber } = req.params;
      const { 
        status, 
        estimatedDeliveryDate, 
        courierName, 
        courierTrackingUrl,
        shipmentEvents
      } = req.body;
      
      // Get order by tracking number
      const order = await storage.getOrderByTrackingNumber(trackingNumber);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Shipment not found"
        });
      }
      
      // Update order with shipment information
      const updatedOrder = await storage.updateOrder(order.id, {
        deliveryStatus: status || order.deliveryStatus,
        estimatedDeliveryDate: estimatedDeliveryDate || order.estimatedDeliveryDate,
        courierName: courierName || order.courierName,
        courierTrackingUrl: courierTrackingUrl || order.courierTrackingUrl,
        shipmentEvents: shipmentEvents || order.shipmentEvents,
        lastUpdated: new Date()
      });
      
      // Broadcast update to all connected clients
      broadcastOrderUpdate();
      
      res.json({
        success: true,
        message: "Shipment information updated successfully",
        shipment: {
          trackingNumber: updatedOrder.trackingNumber,
          status: updatedOrder.deliveryStatus,
          estimatedDelivery: updatedOrder.estimatedDeliveryDate,
          courierName: updatedOrder.courierName,
          courierTrackingUrl: updatedOrder.courierTrackingUrl,
          events: updatedOrder.shipmentEvents,
          lastUpdated: updatedOrder.lastUpdated
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: `Failed to update shipment information: ${(error as Error).message}` 
      });
    }
  });

  // User addresses routes
  app.get('/api/user/addresses', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const addresses = await storage.getUserAddresses(userId);
      res.json(addresses);
    } catch (error) {
      console.error('Error fetching user addresses:', error);
      res.status(500).json({ message: "Error fetching addresses" });
    }
  });

  app.get('/api/user/addresses/:id', isAuthenticated, async (req, res) => {
    try {
      const addressId = parseInt(req.params.id);
      const address = await storage.getUserAddress(addressId);
      
      if (!address) {
        return res.status(404).json({ message: "Address not found" });
      }
      
      // Check if the address belongs to the authenticated user
      if (address.userId !== (req.user as any).id) {
        return res.status(403).json({ message: "Unauthorized access to this address" });
      }
      
      res.json(address);
    } catch (error) {
      console.error('Error fetching address:', error);
      res.status(500).json({ message: "Error fetching address" });
    }
  });

  app.post('/api/user/addresses', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const addressData = req.body;
      
      // Validate address data
      const validatedData = insertUserAddressSchema.parse({
        ...addressData,
        userId
      });
      
      const newAddress = await storage.createUserAddress(validatedData);
      res.status(201).json(newAddress);
    } catch (error) {
      console.error('Error creating address:', error);
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid address data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating address" });
    }
  });

  app.put('/api/user/addresses/:id', isAuthenticated, async (req, res) => {
    try {
      const addressId = parseInt(req.params.id);
      const addressData = req.body;
      
      // Check if address exists and belongs to user
      const existingAddress = await storage.getUserAddress(addressId);
      if (!existingAddress) {
        return res.status(404).json({ message: "Address not found" });
      }
      
      if (existingAddress.userId !== (req.user as any).id) {
        return res.status(403).json({ message: "Unauthorized to modify this address" });
      }
      
      const updatedAddress = await storage.updateUserAddress(addressId, addressData);
      res.json(updatedAddress);
    } catch (error) {
      console.error('Error updating address:', error);
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid address data", errors: error.errors });
      }
      res.status(500).json({ message: "Error updating address" });
    }
  });

  app.delete('/api/user/addresses/:id', isAuthenticated, async (req, res) => {
    try {
      const addressId = parseInt(req.params.id);
      
      // Check if address exists and belongs to user
      const existingAddress = await storage.getUserAddress(addressId);
      if (!existingAddress) {
        return res.status(404).json({ message: "Address not found" });
      }
      
      if (existingAddress.userId !== (req.user as any).id) {
        return res.status(403).json({ message: "Unauthorized to delete this address" });
      }
      
      const deleted = await storage.deleteUserAddress(addressId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(500).json({ message: "Failed to delete address" });
      }
    } catch (error) {
      console.error('Error deleting address:', error);
      res.status(500).json({ message: "Error deleting address" });
    }
  });

  // User payment methods routes
  app.get('/api/user/payment-methods', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const paymentMethods = await storage.getUserPaymentMethods(userId);
      res.json(paymentMethods);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      res.status(500).json({ message: "Error fetching payment methods" });
    }
  });

  app.get('/api/user/payment-methods/:id', isAuthenticated, async (req, res) => {
    try {
      const methodId = parseInt(req.params.id);
      const method = await storage.getUserPaymentMethod(methodId);
      
      if (!method) {
        return res.status(404).json({ message: "Payment method not found" });
      }
      
      // Check if the payment method belongs to the authenticated user
      if (method.userId !== (req.user as any).id) {
        return res.status(403).json({ message: "Unauthorized access to this payment method" });
      }
      
      res.json(method);
    } catch (error) {
      console.error('Error fetching payment method:', error);
      res.status(500).json({ message: "Error fetching payment method" });
    }
  });

  app.post('/api/user/payment-methods', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const paymentData = req.body;
      
      // Validate payment method data
      const validatedData = insertUserPaymentMethodSchema.parse({
        ...paymentData,
        userId
      });
      
      const newPaymentMethod = await storage.createUserPaymentMethod(validatedData);
      res.status(201).json(newPaymentMethod);
    } catch (error) {
      console.error('Error creating payment method:', error);
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid payment method data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating payment method" });
    }
  });

  app.put('/api/user/payment-methods/:id', isAuthenticated, async (req, res) => {
    try {
      const methodId = parseInt(req.params.id);
      const paymentData = req.body;
      
      // Check if payment method exists and belongs to user
      const existingMethod = await storage.getUserPaymentMethod(methodId);
      if (!existingMethod) {
        return res.status(404).json({ message: "Payment method not found" });
      }
      
      if (existingMethod.userId !== (req.user as any).id) {
        return res.status(403).json({ message: "Unauthorized to modify this payment method" });
      }
      
      const updatedMethod = await storage.updateUserPaymentMethod(methodId, paymentData);
      res.json(updatedMethod);
    } catch (error) {
      console.error('Error updating payment method:', error);
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid payment method data", errors: error.errors });
      }
      res.status(500).json({ message: "Error updating payment method" });
    }
  });

  app.delete('/api/user/payment-methods/:id', isAuthenticated, async (req, res) => {
    try {
      const methodId = parseInt(req.params.id);
      
      // Check if payment method exists and belongs to user
      const existingMethod = await storage.getUserPaymentMethod(methodId);
      if (!existingMethod) {
        return res.status(404).json({ message: "Payment method not found" });
      }
      
      if (existingMethod.userId !== (req.user as any).id) {
        return res.status(403).json({ message: "Unauthorized to delete this payment method" });
      }
      
      const deleted = await storage.deleteUserPaymentMethod(methodId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(500).json({ message: "Failed to delete payment method" });
      }
    } catch (error) {
      console.error('Error deleting payment method:', error);
      res.status(500).json({ message: "Error deleting payment method" });
    }
  });

  // User notifications routes
  app.get('/api/user/notifications', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ message: "Error fetching notifications" });
    }
  });

  app.get('/api/user/notifications/unread-count', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error('Error fetching unread notification count:', error);
      res.status(500).json({ message: "Error fetching unread notification count" });
    }
  });

  app.post('/api/user/notifications/mark-read/:id', isAuthenticated, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      
      // Check if notification exists and belongs to user
      const notification = await storage.markNotificationAsRead(notificationId);
      
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      
      if (notification.userId !== (req.user as any).id) {
        return res.status(403).json({ message: "Unauthorized access to this notification" });
      }
      
      res.json(notification);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: "Error marking notification as read" });
    }
  });

  app.post('/api/user/notifications/mark-all-read', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const count = await storage.markAllNotificationsAsRead(userId);
      res.json({ markedCount: count });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ message: "Error marking all notifications as read" });
    }
  });

  app.delete('/api/user/notifications/:id', isAuthenticated, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      
      // We should check if the notification belongs to the user before deleting
      // For now, let's assume the storage method handles this check
      const deleted = await storage.deleteUserNotification(notificationId);
      
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Notification not found or already deleted" });
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ message: "Error deleting notification" });
    }
  });

  // User settings routes
  app.get('/api/user/settings', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      let settings = await storage.getUserSettings(userId);
      
      // If no settings found, create default settings
      if (!settings) {
        settings = await storage.createOrUpdateUserSettings(userId, {});
      }
      
      res.json(settings);
    } catch (error) {
      console.error('Error fetching user settings:', error);
      res.status(500).json({ message: "Error fetching user settings" });
    }
  });

  app.put('/api/user/settings', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const settingsData = req.body;
      
      // Validate settings data
      const validatedData = insertUserSettingSchema.partial().parse(settingsData);
      
      const updatedSettings = await storage.createOrUpdateUserSettings(userId, validatedData);
      res.json(updatedSettings);
    } catch (error) {
      console.error('Error updating user settings:', error);
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      res.status(500).json({ message: "Error updating user settings" });
    }
  });

  const httpServer = createServer(app);
  
  // Set up WebSocket server on a distinct path to avoid conflicting with Vite HMR
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws'
  });
  
  // Store active connections
  const clients = new Set<WebSocket>();
  
  wss.on('connection', (ws: WebSocket) => {
    // Add new client to the set
    clients.add(ws);
    
    console.log('WebSocket client connected');
    
    // Send initial data to the client
    const sendInitialData = async () => {
      try {
        const users = await storage.getAllUsers();
        const userCount = users.length;
        
        const orders = await storage.getOrders();
        const orderCount = orders.length;
        const recentOrders = orders.slice(-5); // Get 5 most recent orders
        
        const products = await storage.getProducts();
        const productCount = products.length;
        const lowStockProducts = products.filter(p => p.quantity < 10);
        
        // Calculate total revenue
        const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        
        const dashboardData = {
          type: 'dashboard_data',
          data: {
            userCount,
            orderCount,
            productCount,
            totalRevenue,
            recentOrders,
            lowStockProducts
          }
        };
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(dashboardData));
        }
      } catch (error) {
        console.error('Error sending initial data:', error);
      }
    };
    
    sendInitialData();
    
    // Handle messages from client
    ws.on('message', async (message: string) => {
      try {
        const parsedMessage = JSON.parse(message.toString());
        console.log('Received message:', parsedMessage.type);
        
        // Handle different message types
        if (parsedMessage.type === 'get_dashboard_data') {
          sendInitialData();
        }
        
        // Handle inventory update from client
        else if (parsedMessage.type === 'client_stock_update') {
          const { productId, newQuantity, productName } = parsedMessage;
          
          if (typeof productId === 'number' && typeof newQuantity === 'number') {
            try {
              // Update product quantity in storage
              const updatedProduct = await storage.updateProductQuantity(productId, newQuantity);
              
              if (updatedProduct) {
                // Broadcast the stock update to all connected clients
                broadcast({
                  type: 'stock_update',
                  productId,
                  newQuantity,
                  productName: productName || updatedProduct.name || 'Product'
                });
                
                console.log(`Stock update broadcast: Product ID ${productId} quantity updated to ${newQuantity}`);
              }
            } catch (error) {
              console.error(`Error updating product quantity:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });
    
    // Handle client disconnection
    ws.on('close', () => {
      clients.delete(ws);
      console.log('WebSocket client disconnected');
    });
  });
  
  // Broadcast function to send messages to all connected clients
  const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };
  
  // User insights API - Get personalized user insights
  app.get("/api/user/insights", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = req.user.id;
      const userInsights = await storage.getUserInsights(userId);
      res.json(userInsights);
    } catch (error) {
      console.error("Failed to get user insights:", error);
      res.status(500).json({ error: "Failed to fetch user insights" });
    }
  });
  
  // User activity stats API - Get user activity statistics
  app.get("/api/user/activity", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = req.user.id;
      const activityStats = await storage.getUserActivityStats(userId);
      res.json(activityStats);
    } catch (error) {
      console.error("Failed to get user activity stats:", error);
      res.status(500).json({ error: "Failed to fetch user activity stats" });
    }
  });

  return httpServer;
}

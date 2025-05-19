// src/index.ts
import express5 from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

// src/config/database.ts
import mongoose from "mongoose";
var connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI environment variable is not defined");
    }
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};
var database_default = connectDB;

// src/routes/authRoutes.ts
import express from "express";

// src/controllers/authController.ts
import jwt from "jsonwebtoken";

// src/models/User.ts
import mongoose2, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
var UserRole = /* @__PURE__ */ ((UserRole2) => {
  UserRole2["CUSTOMER"] = "customer";
  UserRole2["SALES"] = "sales";
  UserRole2["STOREKEEPER"] = "storekeeper";
  UserRole2["OWNER"] = "owner";
  UserRole2["SUPER_ADMIN"] = "super_admin";
  return UserRole2;
})(UserRole || {});
var UserSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true
    },
    firstName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
      trim: true
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: "customer" /* CUSTOMER */
    },
    phone: {
      type: String,
      trim: true
    },
    profileImage: {
      type: String
    },
    stripeCustomerId: {
      type: String
    },
    stripeSubscriptionId: {
      type: String
    }
  },
  {
    timestamps: true
  }
);
UserSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    if (error instanceof Error) {
      next(error);
    } else {
      next(new Error("Unknown error occurred during password hashing"));
    }
  }
});
UserSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};
var User_default = mongoose2.model("User", UserSchema);

// src/models/UserSettings.ts
import mongoose3, { Schema as Schema2 } from "mongoose";
var UserSettingsSchema = new Schema2(
  {
    user: {
      type: Schema2.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    email: {
      orderUpdates: {
        type: Boolean,
        default: true
      },
      promotions: {
        type: Boolean,
        default: true
      },
      newsletter: {
        type: Boolean,
        default: true
      }
    },
    push: {
      orderUpdates: {
        type: Boolean,
        default: true
      },
      promotions: {
        type: Boolean,
        default: false
      },
      stockAlerts: {
        type: Boolean,
        default: false
      }
    },
    sms: {
      orderUpdates: {
        type: Boolean,
        default: false
      },
      promotions: {
        type: Boolean,
        default: false
      }
    },
    display: {
      darkMode: {
        type: Boolean,
        default: false
      },
      language: {
        type: String,
        default: "en"
      },
      currency: {
        type: String,
        default: "NGN"
      }
    },
    privacy: {
      shareDataWithPartners: {
        type: Boolean,
        default: false
      },
      allowLocationTracking: {
        type: Boolean,
        default: false
      }
    },
    // Storekeeper specific settings
    lowStockAlerts: {
      type: Boolean,
      default: true
    },
    stockUpdateNotifications: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);
UserSettingsSchema.index({ user: 1 });
var UserSettings_default = mongoose3.model("UserSettings", UserSettingsSchema);

// src/controllers/authController.ts
var generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }
  return jwt.sign(
    { id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );
};
var register = async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, phone, role } = req.body;
    const userExists = await User_default.findOne({
      $or: [{ email }, { username }]
    });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User with this email or username already exists"
      });
    }
    const user = await User_default.create({
      username,
      email,
      password,
      firstName,
      lastName,
      phone,
      role: role || "customer"
    });
    await UserSettings_default.create({
      user: user._id
    });
    const token = generateToken(user._id);
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred during registration"
    });
  }
};
var login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User_default.findOne({ username });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }
    const token = generateToken(user._id);
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred during login"
    });
  }
};
var getCurrentUser = async (req, res) => {
  try {
    const user = await User_default.findById(req.user?.id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching user data"
    });
  }
};
var logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully"
  });
};

// src/middleware/authMiddleware.ts
import jwt2 from "jsonwebtoken";
var protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token provided"
      });
    }
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in environment variables");
    }
    const decoded = jwt2.verify(token, process.env.JWT_SECRET);
    const user = await User_default.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, user not found"
      });
    }
    req.user = {
      id: user._id.toString(),
      role: user.role
    };
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Not authorized, invalid token"
    });
  }
};
var authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, please login"
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this resource`
      });
    }
    next();
  };
};

// src/routes/authRoutes.ts
var router = express.Router();
router.post("/register", register);
router.post("/login", login);
router.get("/user", protect, getCurrentUser);
router.post("/logout", logout);
var authRoutes_default = router;

// src/routes/userRoutes.ts
import express2 from "express";

// src/controllers/userController.ts
var getUserProfile = async (req, res) => {
  try {
    const user = await User_default.findById(req.user?.id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching user profile"
    });
  }
};
var updateUserProfile = async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    const user = await User_default.findByIdAndUpdate(
      req.user?.id,
      { firstName, lastName, email, phone },
      { new: true, runValidators: true }
    ).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while updating user profile"
    });
  }
};
var getUserSettings = async (req, res) => {
  try {
    let userSettings = await UserSettings_default.findOne({ user: req.user?.id });
    if (!userSettings) {
      userSettings = await UserSettings_default.create({
        user: req.user?.id
      });
    }
    res.status(200).json({
      success: true,
      data: userSettings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching user settings"
    });
  }
};
var updateUserSettings = async (req, res) => {
  try {
    const {
      email,
      push,
      sms,
      display,
      privacy,
      lowStockAlerts,
      stockUpdateNotifications
    } = req.body;
    let userSettings = await UserSettings_default.findOne({ user: req.user?.id });
    if (!userSettings) {
      userSettings = await UserSettings_default.create({
        user: req.user?.id,
        email,
        push,
        sms,
        display,
        privacy,
        lowStockAlerts,
        stockUpdateNotifications
      });
    } else {
      userSettings = await UserSettings_default.findOneAndUpdate(
        { user: req.user?.id },
        {
          email,
          push,
          sms,
          display,
          privacy,
          lowStockAlerts,
          stockUpdateNotifications
        },
        { new: true, runValidators: true }
      );
    }
    res.status(200).json({
      success: true,
      data: userSettings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while updating user settings"
    });
  }
};
var changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User_default.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }
    user.password = newPassword;
    await user.save();
    res.status(200).json({
      success: true,
      message: "Password updated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while changing password"
    });
  }
};

// src/routes/userRoutes.ts
var router2 = express2.Router();
router2.get("/profile", protect, getUserProfile);
router2.put("/profile", protect, updateUserProfile);
router2.get("/settings", protect, getUserSettings);
router2.put("/settings", protect, updateUserSettings);
router2.put("/change-password", protect, changePassword);
var userRoutes_default = router2;

// src/routes/productRoutes.ts
import express3 from "express";

// src/models/Product.ts
import mongoose4, { Schema as Schema3 } from "mongoose";
var ProductSchema = new Schema3(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    images: {
      type: [String],
      default: []
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    tags: {
      type: [String],
      default: []
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 5
    },
    featured: {
      type: Boolean,
      default: false
    },
    discount: {
      type: Number,
      min: 0,
      max: 100
    },
    ratings: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
      },
      count: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    specifications: {
      type: Map,
      of: String
    }
  },
  {
    timestamps: true
  }
);
ProductSchema.index({ name: "text", description: "text", category: "text", tags: "text" });
ProductSchema.index({ price: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ quantity: 1 });
ProductSchema.index({ featured: 1 });
var Product_default = mongoose4.model("Product", ProductSchema);

// src/models/InventoryHistory.ts
import mongoose5, { Schema as Schema4 } from "mongoose";
var InventoryActionType = /* @__PURE__ */ ((InventoryActionType2) => {
  InventoryActionType2["STOCK_ADDED"] = "stock_added";
  InventoryActionType2["STOCK_REMOVED"] = "stock_removed";
  InventoryActionType2["STOCK_ADJUSTED"] = "stock_adjusted";
  InventoryActionType2["LOW_STOCK_ALERT"] = "low_stock_alert";
  InventoryActionType2["PRODUCT_CREATED"] = "product_created";
  InventoryActionType2["PRODUCT_UPDATED"] = "product_updated";
  return InventoryActionType2;
})(InventoryActionType || {});
var InventoryHistorySchema = new Schema4(
  {
    product: {
      type: Schema4.Types.ObjectId,
      ref: "Product",
      required: true
    },
    actionType: {
      type: String,
      enum: Object.values(InventoryActionType),
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    previousQuantity: {
      type: Number,
      required: true
    },
    newQuantity: {
      type: Number,
      required: true
    },
    performedBy: {
      type: Schema4.Types.ObjectId,
      ref: "User",
      required: true
    },
    notes: {
      type: String
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);
InventoryHistorySchema.index({ product: 1 });
InventoryHistorySchema.index({ actionType: 1 });
InventoryHistorySchema.index({ performedBy: 1 });
InventoryHistorySchema.index({ createdAt: -1 });
var InventoryHistory_default = mongoose5.model("InventoryHistory", InventoryHistorySchema);

// src/models/Notification.ts
import mongoose6, { Schema as Schema5 } from "mongoose";
var NotificationType = /* @__PURE__ */ ((NotificationType2) => {
  NotificationType2["ORDER_PLACED"] = "order_placed";
  NotificationType2["ORDER_UPDATED"] = "order_updated";
  NotificationType2["PAYMENT_RECEIVED"] = "payment_received";
  NotificationType2["LOW_STOCK"] = "low_stock";
  NotificationType2["STOCK_UPDATE"] = "stock_update";
  NotificationType2["PRODUCT_REVIEW"] = "product_review";
  NotificationType2["SYSTEM"] = "system";
  return NotificationType2;
})(NotificationType || {});
var NotificationSchema = new Schema5(
  {
    user: {
      type: Schema5.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    read: {
      type: Boolean,
      default: false
    },
    data: {
      type: Schema5.Types.Mixed
    },
    expiresAt: {
      type: Date
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);
NotificationSchema.index({ user: 1 });
NotificationSchema.index({ read: 1 });
NotificationSchema.index({ type: 1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
var Notification_default = mongoose6.model("Notification", NotificationSchema);

// src/controllers/productController.ts
import mongoose7 from "mongoose";
var getAllProducts = async (req, res) => {
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
    const query = {};
    if (category) {
      query.category = category;
    }
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (search) {
      query.$text = { $search: search };
    }
    if (featured === "true") {
      query.featured = true;
    }
    const skip = (Number(page) - 1) * Number(limit);
    let sortOptions = {};
    if (sort) {
      const sortField = sort.startsWith("-") ? sort.substring(1) : sort;
      const sortOrder = sort.startsWith("-") ? -1 : 1;
      sortOptions = { [sortField]: sortOrder };
    } else {
      sortOptions = { createdAt: -1 };
    }
    const products = await Product_default.find(query).sort(sortOptions).skip(skip).limit(Number(limit));
    const total = await Product_default.countDocuments(query);
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching products"
    });
  }
};
var getProductById = async (req, res) => {
  try {
    const product = await Product_default.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching product"
    });
  }
};
var createProduct = async (req, res) => {
  try {
    const product = await Product_default.create(req.body);
    await InventoryHistory_default.create({
      product: product._id,
      actionType: "product_created" /* PRODUCT_CREATED */,
      quantity: product.quantity,
      previousQuantity: 0,
      newQuantity: product.quantity,
      performedBy: req.user.id
    });
    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while creating product"
    });
  }
};
var updateProduct = async (req, res) => {
  try {
    const product = await Product_default.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    const previousQuantity = product.quantity;
    const updatedProduct = await Product_default.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (previousQuantity !== req.body.quantity) {
      await InventoryHistory_default.create({
        product: product._id,
        actionType: "stock_adjusted" /* STOCK_ADJUSTED */,
        quantity: Math.abs(req.body.quantity - previousQuantity),
        previousQuantity,
        newQuantity: req.body.quantity,
        performedBy: req.user.id
      });
      if (req.body.quantity <= product.lowStockThreshold) {
        const storekeepersQuery = await mongoose7.model("User").find({
          role: "storekeeper" /* STOREKEEPER */
        });
        const storekeeperSettings = await mongoose7.model("UserSettings").find({
          user: { $in: storekeepersQuery.map((sk) => sk._id) },
          lowStockAlerts: true
        });
        for (const setting of storekeeperSettings) {
          await Notification_default.create({
            user: setting.user,
            type: "low_stock" /* LOW_STOCK */,
            title: "Low Stock Alert",
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while updating product"
    });
  }
};
var deleteProduct = async (req, res) => {
  try {
    const product = await Product_default.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    await Product_default.findByIdAndDelete(req.params.id);
    res.status(200).json({
      success: true,
      message: "Product deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while deleting product"
    });
  }
};
var updateInventory = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity === void 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity is required"
      });
    }
    const product = await Product_default.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    const previousQuantity = product.quantity;
    const newQuantity = Number(quantity);
    const actionType = newQuantity > previousQuantity ? "stock_added" /* STOCK_ADDED */ : "stock_removed" /* STOCK_REMOVED */;
    product.quantity = newQuantity;
    await product.save();
    await InventoryHistory_default.create({
      product: product._id,
      actionType,
      quantity: Math.abs(newQuantity - previousQuantity),
      previousQuantity,
      newQuantity,
      performedBy: req.user.id,
      notes: req.body.notes
    });
    if (actionType === "stock_added" /* STOCK_ADDED */ || actionType === "stock_removed" /* STOCK_REMOVED */) {
      const storekeepersQuery = await mongoose7.model("User").find({
        role: "storekeeper" /* STOREKEEPER */
      });
      const storekeeperSettings = await mongoose7.model("UserSettings").find({
        user: { $in: storekeepersQuery.map((sk) => sk._id) },
        stockUpdateNotifications: true
      });
      for (const setting of storekeeperSettings) {
        await Notification_default.create({
          user: setting.user,
          type: "stock_update" /* STOCK_UPDATE */,
          title: "Stock Update",
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
    if (newQuantity <= product.lowStockThreshold) {
      const storekeepersQuery = await mongoose7.model("User").find({
        role: "storekeeper" /* STOREKEEPER */
      });
      const storekeeperSettings = await mongoose7.model("UserSettings").find({
        user: { $in: storekeepersQuery.map((sk) => sk._id) },
        lowStockAlerts: true
      });
      for (const setting of storekeeperSettings) {
        await Notification_default.create({
          user: setting.user,
          type: "low_stock" /* LOW_STOCK */,
          title: "Low Stock Alert",
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while updating inventory"
    });
  }
};
var getInventoryHistory = async (req, res) => {
  try {
    const history = await InventoryHistory_default.find({ product: req.params.id }).sort({ createdAt: -1 }).populate("performedBy", "username firstName lastName");
    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching inventory history"
    });
  }
};

// src/routes/productRoutes.ts
var router3 = express3.Router();
router3.get("/", getAllProducts);
router3.get("/:id", getProductById);
router3.post(
  "/",
  protect,
  authorize("owner" /* OWNER */, "super_admin" /* SUPER_ADMIN */),
  createProduct
);
router3.put(
  "/:id",
  protect,
  authorize("owner" /* OWNER */, "super_admin" /* SUPER_ADMIN */),
  updateProduct
);
router3.delete(
  "/:id",
  protect,
  authorize("owner" /* OWNER */, "super_admin" /* SUPER_ADMIN */),
  deleteProduct
);
router3.put(
  "/:id/inventory",
  protect,
  authorize("owner" /* OWNER */, "super_admin" /* SUPER_ADMIN */, "storekeeper" /* STOREKEEPER */),
  updateInventory
);
router3.get(
  "/:id/inventory-history",
  protect,
  authorize("owner" /* OWNER */, "super_admin" /* SUPER_ADMIN */, "storekeeper" /* STOREKEEPER */),
  getInventoryHistory
);
var productRoutes_default = router3;

// src/routes/notificationRoutes.ts
import express4 from "express";

// src/controllers/notificationController.ts
var getUserNotifications = async (req, res) => {
  try {
    const { limit = 20, page = 1, read } = req.query;
    const query = { user: req.user?.id };
    if (read !== void 0) {
      query.read = read === "true";
    }
    const skip = (Number(page) - 1) * Number(limit);
    const notifications = await Notification_default.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Notification_default.countDocuments(query);
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching notifications"
    });
  }
};
var markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification_default.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }
    if (notification.user.toString() !== req.user?.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this notification"
      });
    }
    notification.read = true;
    await notification.save();
    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while marking notification as read"
    });
  }
};
var markAllNotificationsAsRead = async (req, res) => {
  try {
    await Notification_default.updateMany(
      { user: req.user?.id, read: false },
      { read: true }
    );
    res.status(200).json({
      success: true,
      message: "All notifications marked as read"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while marking all notifications as read"
    });
  }
};
var deleteNotification = async (req, res) => {
  try {
    const notification = await Notification_default.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }
    if (notification.user.toString() !== req.user?.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this notification"
      });
    }
    await Notification_default.findByIdAndDelete(req.params.id);
    res.status(200).json({
      success: true,
      message: "Notification deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while deleting notification"
    });
  }
};
var getNotificationCount = async (req, res) => {
  try {
    const count = await Notification_default.countDocuments({
      user: req.user?.id,
      read: false
    });
    res.status(200).json({
      success: true,
      data: { count }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while getting notification count"
    });
  }
};

// src/routes/notificationRoutes.ts
var router4 = express4.Router();
router4.get("/", protect, getUserNotifications);
router4.get("/count", protect, getNotificationCount);
router4.put("/:id/read", protect, markNotificationAsRead);
router4.put("/read-all", protect, markAllNotificationsAsRead);
router4.delete("/:id", protect, deleteNotification);
var notificationRoutes_default = router4;

// src/index.ts
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
dotenv.config();
database_default();
var app = express5();
app.use(cors());
app.use(express5.json());
app.use(express5.urlencoded({ extended: true }));
var uploadsDir = path.join(process.cwd(), "uploads");
console.log("Upload directory absolute path:", uploadsDir);
app.use("/uploads", express5.static(uploadsDir));
console.log("Static file middleware set up for /uploads pointing to", uploadsDir);
app.use("/api/auth", authRoutes_default);
app.use("/api/users", userRoutes_default);
app.use("/api/products", productRoutes_default);
app.use("/api/notifications", notificationRoutes_default);
app.get("/", (req, res) => {
  res.json({ message: "Welcome to DASH NG API" });
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(statusCode).json({
    success: false,
    error: message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack
  });
});
var PORT = process.env.PORT || 5e3;
var server = http.createServer(app);
var wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
  ws.send(JSON.stringify({
    type: "connection_established",
    message: "Connected to DASH NG WebSocket server"
  }));
  ws.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data.toString());
      console.log("Received message:", data.type);
      if (data.type === "client_stock_update") {
        broadcastStockUpdate(data.productId, data.quantity);
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });
  ws.addEventListener("close", () => {
    console.log("WebSocket client disconnected");
  });
});
function broadcastStockUpdate(productId, quantity) {
  console.log(`Stock update broadcast: Product ID ${productId} quantity updated to ${quantity}`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "stock_update",
        productId,
        quantity
      }));
    }
  });
}
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running at ws://localhost:${PORT}/ws`);
});

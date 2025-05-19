import { 
  users, type User, type InsertUser,
  products, type Product, type InsertProduct,
  cartItems, type CartItem, type InsertCartItem, 
  wishlistItems, type WishlistItem, type InsertWishlistItem,
  orders, type Order, type InsertOrder,
  orderItems, type OrderItem, type InsertOrderItem,
  coupons, type Coupon, type InsertCoupon,
  tempAccessTokens, type TempAccessToken, type InsertTempAccessToken,
  deposits, type Deposit, type InsertDeposit,
  adminActivityLogs, type AdminActivityLog, type InsertAdminActivityLog,
  adminSalesPerformance, type AdminSalesPerformance, type InsertAdminSalesPerformance,
  visitorStats, type VisitorStats, type InsertVisitorStats,
  visitorSessions, type VisitorSession, type InsertVisitorSession,
  activeVisitors, type ActiveVisitor, type InsertActiveVisitor,
  userAddresses, type UserAddress, type InsertUserAddress,
  userPaymentMethods, type UserPaymentMethod, type InsertUserPaymentMethod,
  userNotifications, type UserNotification, type InsertUserNotification,
  userSettings, type UserSetting, type InsertUserSetting
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

// Create promisified version of scrypt for async password hashing
const scryptAsync = promisify(scrypt);

const MemoryStore = createMemoryStore(session);

// modify the interface with any CRUD methods
// you might need
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getAllAdmins(): Promise<User[]>; // Get all admin users
  getAllSubAdmins(superAdminId: number): Promise<User[]>; // Get all sub-admins created by a super admin
  getAdminsByMaster(masterId: number): Promise<User[]>; // Get all admin users created by a master admin
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  createSuperAdmin(user: InsertUser): Promise<User>; // Create super admin
  createSubAdmin(user: InsertUser, createdById: number, expiresAt?: Date): Promise<User>; // Create sub-admin with optional expiration
  createStorePersonnel(user: InsertUser, createdById: number): Promise<User>; // Create store personnel
  updateAdminActivity(id: number): Promise<User | undefined>; // Update admin last active timestamp
  updateAdminLoginTime(id: number): Promise<User | undefined>; // Record admin login time
  updateAdminLogoutTime(id: number): Promise<User | undefined>; // Record admin logout time
  incrementAdminSalesCount(id: number, saleAmount?: number): Promise<User | undefined>; // Increment admin sales count and optionally add to sales total
  incrementAdminOrderProcessCount(id: number): Promise<User | undefined>; // Increment admin order process count
  deactivateAdmin(id: number): Promise<User | undefined>; // Deactivate sub-admin account
  reactivateAdmin(id: number): Promise<User | undefined>; // Reactivate sub-admin account
  setAdminExpiration(id: number, expiresAt: Date): Promise<User | undefined>; // Set sub-admin account expiration date
  
  // Admin activity tracking methods
  logAdminActivity(log: InsertAdminActivityLog): Promise<AdminActivityLog>; // Log admin activity
  getAdminActivities(adminId: number): Promise<AdminActivityLog[]>; // Get all activities for an admin
  getRecentAdminActivities(limit?: number): Promise<AdminActivityLog[]>; // Get recent admin activities
  
  // Admin sales performance methods
  createOrUpdateAdminSalesPerformance(data: InsertAdminSalesPerformance): Promise<AdminSalesPerformance>; // Record admin sales performance
  getAdminDailySalesPerformance(adminId: number, date: Date): Promise<AdminSalesPerformance | undefined>; // Get admin sales performance for a specific date
  getAdminSalesPerformance(adminId: number, startDate: Date, endDate: Date): Promise<AdminSalesPerformance[]>; // Get admin sales performance for a date range
  getTopPerformingAdmins(limit?: number, startDate?: Date, endDate?: Date): Promise<AdminSalesPerformance[]>; // Get top performing admins
  
  // Product methods
  getProduct(id: number): Promise<Product | undefined>;
  getProducts(options?: {
    category?: string;
    subcategory?: string;
    brand?: string;
    brandType?: string;
    featured?: boolean;
    isNewArrival?: boolean;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    inStoreAvailable?: boolean; // Added for in-store products
    search?: string; // Added for search functionality
  }): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<Product>): Promise<Product | undefined>;
  updateProductQuantity(id: number, quantity: number): Promise<Product | undefined>; // Add method specifically for real-time inventory updates
  deleteProduct(id: number): Promise<boolean>;
  
  // Cart methods
  getCartItems(userId: number): Promise<CartItem[]>;
  getCartItemWithProduct(cartItemId: number): Promise<(CartItem & { product: Product }) | undefined>;
  getCartItemsByUserWithProducts(userId: number): Promise<(CartItem & { product: Product })[]>;
  getCartItem(id: number): Promise<CartItem | undefined>;
  addToCart(cartItem: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: number, quantity: number): Promise<CartItem | undefined>;
  removeFromCart(id: number): Promise<boolean>;
  clearCart(userId: number): Promise<boolean>;
  
  // Wishlist methods
  getWishlistItems(userId: number): Promise<WishlistItem[]>;
  getWishlistItemsByUserWithProducts(userId: number): Promise<(WishlistItem & { product: Product })[]>;
  addToWishlist(wishlistItem: InsertWishlistItem): Promise<WishlistItem>;
  removeFromWishlist(id: number): Promise<boolean>;
  
  // Order methods
  getOrder(id: number): Promise<Order | undefined>;
  getOrderByTrackingNumber(trackingNumber: string): Promise<Order | undefined>;
  getOrders(options?: {
    userId?: number; 
    adminId?: number;
    includeArchived?: boolean; 
    fromDate?: Date; 
    toDate?: Date;
    orderType?: 'all' | 'online' | 'in-store';
    includeItems?: boolean;
  }): Promise<Order[] | (Order & { items: (OrderItem & { product: Product })[] })[]>;
  getOrderWithItems(orderId: number): Promise<(Order & { items: (OrderItem & { product: Product })[] }) | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  updateDeliveryStatus(id: number, status: string): Promise<Order | undefined>;
  updatePaymentStatus(id: number, paymentStatus: string): Promise<Order | undefined>;
  updateOrderAdmin(id: number, adminId: number, adminName: string): Promise<Order | undefined>; // Set admin who processed order
  getOrdersNeedingNotification(): Promise<Order[]>; // Get orders needing delivery notification
  updateOrderNotification(id: number): Promise<Order | undefined>; // Update order notification timestamp
  
  // Order items methods
  createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem>;
  getOrderItems(orderId: number): Promise<OrderItem[]>;
  
  // Coupon methods
  getCoupon(code: string): Promise<Coupon | undefined>;
  createCoupon(coupon: InsertCoupon): Promise<Coupon>;
  updateCoupon(id: number, coupon: Partial<Coupon>): Promise<Coupon | undefined>;
  deleteCoupon(id: number): Promise<boolean>;
  
  // Temporary access tokens
  createTempAccessToken(token: InsertTempAccessToken): Promise<TempAccessToken>;
  getTempAccessToken(token: string): Promise<TempAccessToken | undefined>;
  markTempAccessTokenUsed(token: string): Promise<TempAccessToken | undefined>;
  invalidateTempAccessToken(token: string): Promise<boolean>;
  getAdminTempAccessTokens(adminId: number): Promise<TempAccessToken[]>;
  cleanupExpiredTokens(): Promise<number>; // Returns count of deleted tokens
  
  // Deposit methods for in-store items
  createDeposit(deposit: InsertDeposit): Promise<Deposit>;
  getDeposit(id: number): Promise<Deposit | undefined>;
  getDeposits(options?: {
    adminId?: number;
    customerId?: number;
    status?: string;
    productId?: number;
  }): Promise<Deposit[]>;
  getDepositWithProduct(depositId: number): Promise<(Deposit & { product: Product }) | undefined>;
  updateDepositStatus(id: number, status: string): Promise<Deposit | undefined>;
  completeDeposit(id: number, paymentDetails: {
    paymentMethod: string;
    completedAt?: Date;
  }): Promise<Deposit | undefined>;
  processRefund(id: number, refundDetails: {
    refundAmount: number;
    refundReason: string;
    refundedAt?: Date;
  }): Promise<Deposit | undefined>;
  
  // User insights methods
  getUserInsights(userId: number): Promise<any>;
  getUserActivityStats(userId: number): Promise<any>;
  
  // Visitor tracking methods
  trackPageVisit(pageUrl: string, sessionId: string, userId?: number): Promise<void>;
  recordVisitorSession(sessionData: InsertVisitorSession): Promise<VisitorSession>;
  updateVisitorSession(sessionId: string, updateData: Partial<VisitorSession>): Promise<VisitorSession | undefined>;
  trackActiveVisitor(visitorData: InsertActiveVisitor): Promise<ActiveVisitor>;
  updateActiveVisitor(sessionId: string, updateData: Partial<ActiveVisitor>): Promise<ActiveVisitor | undefined>;
  removeActiveVisitor(sessionId: string): Promise<boolean>;
  getActiveVisitorsCount(): Promise<number>;
  getActiveVisitorsByPage(): Promise<Record<string, number>>;
  getDailyVisitorStats(date: Date): Promise<VisitorStats | undefined>;
  updateDailyVisitorStats(date: Date, updateData: Partial<VisitorStats>): Promise<VisitorStats | undefined>;
  getVisitorStatsByDateRange(startDate: Date, endDate: Date): Promise<VisitorStats[]>;
  
  // User addresses methods
  getUserAddresses(userId: number): Promise<UserAddress[]>;
  getUserAddress(id: number): Promise<UserAddress | undefined>;
  createUserAddress(addressData: InsertUserAddress): Promise<UserAddress>;
  updateUserAddress(id: number, addressData: Partial<InsertUserAddress>): Promise<UserAddress | undefined>;
  deleteUserAddress(id: number): Promise<boolean>;
  
  // User payment methods methods
  getUserPaymentMethods(userId: number): Promise<UserPaymentMethod[]>;
  getUserPaymentMethod(id: number): Promise<UserPaymentMethod | undefined>;
  createUserPaymentMethod(paymentData: InsertUserPaymentMethod): Promise<UserPaymentMethod>;
  updateUserPaymentMethod(id: number, paymentData: Partial<InsertUserPaymentMethod>): Promise<UserPaymentMethod | undefined>;
  deleteUserPaymentMethod(id: number): Promise<boolean>;
  
  // User notifications methods
  getUserNotifications(userId: number): Promise<UserNotification[]>;
  getUnreadNotificationCount(userId: number): Promise<number>;
  createUserNotification(notificationData: InsertUserNotification): Promise<UserNotification>;
  markNotificationAsRead(id: number): Promise<UserNotification | undefined>;
  markAllNotificationsAsRead(userId: number): Promise<number>;
  deleteUserNotification(id: number): Promise<boolean>;
  
  // User settings methods
  getUserSettings(userId: number): Promise<UserSetting | undefined>;
  createOrUpdateUserSettings(userId: number, settingsData: Partial<InsertUserSetting>): Promise<UserSetting>;
  
  // Session store
  sessionStore: any; // Using any for session store type to avoid namespace issues
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private products: Map<number, Product>;
  private cartItems: Map<number, CartItem>;
  private wishlistItems: Map<number, WishlistItem>;
  private orders: Map<number, Order>;
  private orderItems: Map<number, OrderItem>;
  private coupons: Map<number, Coupon>;
  private tempAccessTokens: Map<number, TempAccessToken>;
  private deposits: Map<number, Deposit>;
  private adminActivityLogs: Map<number, AdminActivityLog>;
  private adminSalesPerformance: Map<number, AdminSalesPerformance>;
  private visitorStats: Map<string, VisitorStats>;
  private visitorSessions: Map<string, VisitorSession>;
  private activeVisitors: Map<string, ActiveVisitor>;
  private userAddresses: Map<number, UserAddress>;
  private userPaymentMethods: Map<number, UserPaymentMethod>;
  private userNotifications: Map<number, UserNotification>;
  private userSettings: Map<number, UserSetting>;
  sessionStore: any; // Using any for session store type to avoid namespace issues
  
  currentUserId: number;
  currentProductId: number;
  currentCartItemId: number;
  currentWishlistItemId: number;
  currentOrderId: number;
  currentOrderItemId: number;
  currentCouponId: number;
  currentTempAccessTokenId: number;
  currentDepositId: number;
  currentActivityLogId: number;
  currentSalesPerformanceId: number;
  currentUserAddressId: number;
  currentUserPaymentMethodId: number;
  currentUserNotificationId: number;
  currentUserSettingId: number;

  constructor() {
    this.users = new Map();
    this.products = new Map();
    this.cartItems = new Map();
    this.wishlistItems = new Map();
    this.orders = new Map();
    this.orderItems = new Map();
    this.coupons = new Map();
    this.tempAccessTokens = new Map();
    this.deposits = new Map();
    this.adminActivityLogs = new Map();
    this.adminSalesPerformance = new Map();
    this.visitorStats = new Map();
    this.visitorSessions = new Map();
    this.activeVisitors = new Map();
    this.userAddresses = new Map();
    this.userPaymentMethods = new Map();
    this.userNotifications = new Map();
    this.userSettings = new Map();
    
    this.currentUserId = 1;
    this.currentProductId = 1;
    this.currentCartItemId = 1;
    this.currentWishlistItemId = 1;
    this.currentOrderId = 1;
    this.currentOrderItemId = 1;
    this.currentCouponId = 1;
    this.currentTempAccessTokenId = 1;
    this.currentDepositId = 1;
    this.currentActivityLogId = 1;
    this.currentSalesPerformanceId = 1;
    this.currentUserAddressId = 1;
    this.currentUserPaymentMethodId = 1;
    this.currentUserNotificationId = 1;
    this.currentUserSettingId = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
    
    // Admin users will be created asynchronously
    this.seedAdminUsers();
    
    // Create sample products
    this.seedProducts();
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async getAllAdmins(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.isAdmin);
  }
  
  async getAdminsByMaster(masterId: number): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => 
      user.isAdmin && user.createdBy === masterId
    );
  }
  
  async createStorePersonnel(user: InsertUser, createdById: number): Promise<User> {
    // First ensure the creator is a master admin, manager, or owner
    const creator = await this.getUser(createdById);
    
    // Allow owner role to create store personnel
    if (!creator || !creator.isAdmin || 
        (creator.adminRole !== 'master' && 
         creator.adminRole !== 'manager' && 
         creator.adminRole !== 'owner' &&
         creator.adminRole !== 'super')) {
      throw new Error("Only super admins, owners, master admins, or managers can create store personnel accounts");
    }
    
    // Log information for debugging
    console.log("Creator ID:", createdById, "Role:", creator?.adminRole, "Is Admin:", creator?.isAdmin);
    
    // Set necessary fields for store personnel
    const personnelData = {
      ...user,
      isAdmin: true,
      isMasterAdmin: false,
      adminRole: "staff",
      createdBy: createdById,
      isActive: false, // Set to inactive by default until they log in
      adminName: user.firstName && user.lastName ? 
        `${user.firstName} ${user.lastName}` : user.username
    };
    
    // Create the user using the standard method
    return this.createUser(personnelData);
  }

  // Helper method to hash passwords
  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  }
  
  // Create admin users with hashed passwords
  private async seedAdminUsers() {
    // First, create the owner (previously master admin)
    const ownerAdmin = {
      username: "owner",
      email: "owner@dashng.com",
      password: await this.hashPassword("DashOwner#"),
      firstName: "Shop",
      lastName: "Owner",
      isAdmin: true,
      isMasterAdmin: true,
      adminRole: "super" // Now has both owner and super admin capabilities
    };
    
    // Create the owner user first (previously master admin) - now with super admin capabilities
    const masterId = this.currentUserId++;
    const masterUser: User = {
      ...ownerAdmin,
      id: masterId,
      phone: null,
      address: null,
      city: null,
      state: null,
      country: null,
      adminName: ownerAdmin.firstName + ' ' + ownerAdmin.lastName,
      adminSalesCount: 0,
      salesTotal: 0,
      orderProcessCount: 0,
      lastActive: null,
      lastLogin: null,
      lastLogout: null,
      createdBy: null, // Master admin has no creator
      isSuperAdmin: true, // Given super admin capabilities
      createdAt: new Date(),
      expiresAt: null,
      isActive: true
    };
    this.users.set(masterId, masterUser);
    
    // Super admin role has been merged with Owner role
      
    // Other admin users
    const adminUsers = [
      {
        username: "salesperson1",
        email: "sales1@dashng.com",
        password: await this.hashPassword("DashSales1#"),
        firstName: "Sales",
        lastName: "Person 1",
        isAdmin: true,
        isMasterAdmin: false,
        adminRole: "sales",
        createdBy: masterId
      },
      {
        username: "salesperson2",
        email: "sales2@dashng.com",
        password: await this.hashPassword("DashSales2#"),
        firstName: "Sales",
        lastName: "Person 2",
        isAdmin: true,
        isMasterAdmin: false,
        adminRole: "sales",
        createdBy: masterId
      },
      {
        username: "storekeeper",
        email: "storekeeper@dashng.com",
        password: await this.hashPassword("DashStore#"),
        firstName: "Store",
        lastName: "Keeper",
        isAdmin: true,
        isMasterAdmin: false,
        adminRole: "storekeeper",
        createdBy: masterId
      },
      // Removed salesperson3 as requested
      // Removed admin4/salesperson4 & storekeeper2 as requested
    ];
    
    // Create each admin user with proper user object
    for (const admin of adminUsers) {
      const id = this.currentUserId++;
      const user: User = {
        ...admin,
        id,
        phone: null,
        address: null,
        city: null,
        state: null,
        country: null,
        adminName: admin.firstName + ' ' + admin.lastName,
        adminSalesCount: 0,
        salesTotal: 0,
        orderProcessCount: 0,
        lastActive: null,
        lastLogin: null,
        lastLogout: null,
        isMasterAdmin: admin.isMasterAdmin || false,
        isSuperAdmin: false,
        adminRole: admin.adminRole || 'staff',
        createdBy: admin.createdBy || null,
        createdAt: new Date(),
        expiresAt: null,
        isActive: true
      };
      this.users.set(id, user);
    }
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    
    // If this is a direct call (not from auth middleware), hash the password
    let userToInsert = { ...insertUser };
    
    // Hash the password if it's not already hashed (doesn't contain a .)
    if (userToInsert.password && !userToInsert.password.includes('.')) {
      userToInsert.password = await this.hashPassword(userToInsert.password);
    }
    
    // Ensure we're working with a proper User object with all required fields
    const user: User = { 
      ...userToInsert, 
      id,
      firstName: userToInsert.firstName || null,
      lastName: userToInsert.lastName || null,
      phone: userToInsert.phone || null,
      address: userToInsert.address || null,
      city: userToInsert.city || null,
      state: userToInsert.state || null,
      country: userToInsert.country || null,
      isAdmin: userToInsert.isAdmin || false,
      isMasterAdmin: userToInsert.isMasterAdmin || false,
      isSuperAdmin: userToInsert.isSuperAdmin || false,
      adminRole: userToInsert.adminRole || "staff",
      adminName: userToInsert.adminName || null,
      adminSalesCount: userToInsert.adminSalesCount || 0,
      salesTotal: userToInsert.salesTotal || 0,
      orderProcessCount: userToInsert.orderProcessCount || 0,
      lastActive: userToInsert.lastActive || null,
      lastLogin: userToInsert.lastLogin || null,
      lastLogout: userToInsert.lastLogout || null,
      createdBy: userToInsert.createdBy || null,
      createdAt: userToInsert.createdAt || new Date(),
      expiresAt: userToInsert.expiresAt || null,
      isActive: userToInsert.isActive !== undefined ? userToInsert.isActive : true
    };
    
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    const user = await this.getUser(id);
    if (!user) return false;
    
    // Don't allow deleting master admin or super admin
    if (user.isMasterAdmin || user.isSuperAdmin) {
      return false;
    }
    
    // Log activity about the deletion
    if (user.createdBy) {
      const creator = await this.getUser(user.createdBy);
      if (creator) {
        await this.logAdminActivity({
          adminId: creator.id,
          adminName: creator.adminName || creator.username,
          activityType: "delete_admin",
          activityDetails: {
            deletedAdminId: id,
            deletedAdminName: user.username
          },
          timestamp: new Date(),
          success: true
        });
      }
    }
    
    // Remove the user
    return this.users.delete(id);
  }
  
  // Admin activity tracking methods
  async updateAdminActivity(id: number): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user || !user.isAdmin) return undefined;
    
    const now = new Date();
    const updatedUser = { ...user, lastActive: now };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async incrementAdminSalesCount(id: number, saleAmount?: number): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user || !user.isAdmin) return undefined;
    
    const currentCount = user.adminSalesCount || 0;
    const currentTotal = user.salesTotal || 0;
    const updatedUser = { 
      ...user, 
      adminSalesCount: currentCount + 1,
      salesTotal: saleAmount ? currentTotal + saleAmount : currentTotal
    };
    this.users.set(id, updatedUser);
    
    // Also update the sales performance record for this admin
    if (saleAmount) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of day
      await this.createOrUpdateAdminSalesPerformance({
        adminId: id,
        adminName: user.adminName || user.username,
        date: today,
        salesCount: 1,
        salesTotal: saleAmount,
        ordersProcessed: 0,
        customersServed: 1, // Assume one customer per sale
        averageOrderValue: saleAmount // This will be averaged later if multiple sales
      });
    }
    
    return updatedUser;
  }
  
  async incrementAdminOrderProcessCount(id: number): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user || !user.isAdmin) return undefined;
    
    const currentCount = user.orderProcessCount || 0;
    const updatedUser = { ...user, orderProcessCount: currentCount + 1 };
    this.users.set(id, updatedUser);
    
    // Also update the sales performance record for this admin
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of day
    await this.createOrUpdateAdminSalesPerformance({
      adminId: id,
      adminName: user.adminName || user.username,
      date: today,
      salesCount: 0,
      salesTotal: 0,
      ordersProcessed: 1,
      customersServed: 0,
      averageOrderValue: 0
    });
    
    return updatedUser;
  }
  
  // Super Admin functionality
  async createSuperAdmin(user: InsertUser): Promise<User> {
    // Set necessary fields for super admin
    const superAdminData = {
      ...user,
      isAdmin: true,
      isMasterAdmin: false,
      isSuperAdmin: true,
      adminRole: "super",
      adminName: user.firstName && user.lastName ? 
        `${user.firstName} ${user.lastName}` : user.username,
      isActive: true,
      createdAt: new Date()
    };
    
    // Create the user using the standard method
    return this.createUser(superAdminData);
  }
  
  async getAllSubAdmins(superAdminId: number): Promise<User[]> {
    // Get the super admin to verify
    const superAdmin = await this.getUser(superAdminId);
    if (!superAdmin || !superAdmin.isSuperAdmin) {
      return []; // Return empty array if not a super admin
    }
    
    return Array.from(this.users.values()).filter(user => 
      user.isAdmin && user.createdBy === superAdminId
    );
  }
  
  async createSubAdmin(user: InsertUser, createdById: number, expiresAt?: Date): Promise<User> {
    // First ensure the creator is a super admin
    const creator = await this.getUser(createdById);
    if (!creator || !creator.isSuperAdmin) {
      throw new Error("Only super admins can create sub-admin accounts");
    }
    
    // Set necessary fields for sub-admin
    const subAdminData = {
      ...user,
      isAdmin: true,
      isMasterAdmin: false,
      isSuperAdmin: false,
      adminRole: "subadmin",
      createdBy: createdById,
      adminName: user.firstName && user.lastName ? 
        `${user.firstName} ${user.lastName}` : user.username,
      createdAt: new Date(),
      expiresAt: expiresAt || null,
      isActive: true
    };
    
    // Create the sub-admin
    const subAdmin = await this.createUser(subAdminData);
    
    // Log the activity
    await this.logAdminActivity({
      adminId: createdById,
      adminName: creator.adminName || creator.username,
      activityType: "create_subadmin",
      activityDetails: {
        subAdminId: subAdmin.id,
        subAdminName: subAdmin.adminName,
        expiresAt: expiresAt ? expiresAt.toISOString() : null
      },
      timestamp: new Date(),
      success: true
    });
    
    return subAdmin;
  }
  
  async updateAdminLoginTime(id: number): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user || !user.isAdmin) return undefined;
    
    const now = new Date();
    
    // Set isActive to true when an admin logs in
    const updatedUser = { 
      ...user, 
      lastLogin: now, 
      lastActive: now,
      isActive: true // Activate the admin account on login
    };
    
    this.users.set(id, updatedUser);
    
    // Log the activity
    await this.logAdminActivity({
      adminId: id,
      adminName: user.adminName || user.username,
      activityType: "login",
      timestamp: now,
      success: true
    });
    
    return updatedUser;
  }
  
  async updateAdminLogoutTime(id: number): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user || !user.isAdmin) return undefined;
    
    const now = new Date();
    const updatedUser = { ...user, lastLogout: now };
    this.users.set(id, updatedUser);
    
    // Log the activity
    await this.logAdminActivity({
      adminId: id,
      adminName: user.adminName || user.username,
      activityType: "logout",
      timestamp: now,
      success: true
    });
    
    return updatedUser;
  }
  
  async deactivateAdmin(id: number): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user || !user.isAdmin) return undefined;
    
    const updatedUser = { ...user, isActive: false };
    this.users.set(id, updatedUser);
    
    return updatedUser;
  }
  
  async reactivateAdmin(id: number): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user || !user.isAdmin) return undefined;
    
    const updatedUser = { ...user, isActive: true };
    this.users.set(id, updatedUser);
    
    return updatedUser;
  }
  
  async setAdminExpiration(id: number, expiresAt: Date): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user || !user.isAdmin) return undefined;
    
    const updatedUser = { ...user, expiresAt };
    this.users.set(id, updatedUser);
    
    return updatedUser;
  }
  
  // Admin activity tracking
  async logAdminActivity(log: InsertAdminActivityLog): Promise<AdminActivityLog> {
    const id = this.currentActivityLogId++;
    const now = new Date();
    
    const activityLog: AdminActivityLog = {
      ...log,
      id,
      timestamp: log.timestamp || now,
      success: log.success !== undefined ? log.success : true,
      activityDetails: log.activityDetails || {}, // Ensure activityDetails is present
      ipAddress: log.ipAddress || null
    };
    
    this.adminActivityLogs.set(id, activityLog);
    return activityLog;
  }
  
  async getAdminActivities(adminId: number): Promise<AdminActivityLog[]> {
    return Array.from(this.adminActivityLogs.values())
      .filter(log => log.adminId === adminId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  
  async getRecentAdminActivities(limit: number = 100): Promise<AdminActivityLog[]> {
    return Array.from(this.adminActivityLogs.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
  
  // Admin sales performance tracking
  async createOrUpdateAdminSalesPerformance(data: InsertAdminSalesPerformance): Promise<AdminSalesPerformance> {
    // First check if we already have a record for this admin on this date
    const existingRecord = Array.from(this.adminSalesPerformance.values()).find(
      record => record.adminId === data.adminId && 
                record.date.getTime() === new Date(data.date).getTime()
    );
    
    if (existingRecord) {
      // Update existing record
      const updatedRecord: AdminSalesPerformance = {
        ...existingRecord,
        salesCount: existingRecord.salesCount + (data.salesCount || 0),
        salesTotal: existingRecord.salesTotal + (data.salesTotal || 0),
        ordersProcessed: existingRecord.ordersProcessed + (data.ordersProcessed || 0),
        customersServed: existingRecord.customersServed + (data.customersServed || 0),
      };
      
      // Calculate average order value if there are sales
      if (updatedRecord.salesCount > 0) {
        updatedRecord.averageOrderValue = updatedRecord.salesTotal / updatedRecord.salesCount;
      }
      
      this.adminSalesPerformance.set(existingRecord.id, updatedRecord);
      return updatedRecord;
    } else {
      // Create new record
      const id = this.currentSalesPerformanceId++;
      const performanceRecord: AdminSalesPerformance = {
        ...data,
        id,
        date: new Date(data.date),
        salesCount: data.salesCount || 0,
        salesTotal: data.salesTotal || 0,
        ordersProcessed: data.ordersProcessed || 0,
        customersServed: data.customersServed || 0,
        averageOrderValue: data.salesCount > 0 ? data.salesTotal / data.salesCount : 0
      };
      
      this.adminSalesPerformance.set(id, performanceRecord);
      return performanceRecord;
    }
  }
  
  async getAdminDailySalesPerformance(adminId: number, date: Date): Promise<AdminSalesPerformance | undefined> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0); // Start of day
    
    return Array.from(this.adminSalesPerformance.values()).find(
      record => record.adminId === adminId && 
                new Date(record.date).getTime() === targetDate.getTime()
    );
  }
  
  async getAdminSalesPerformance(adminId: number, startDate: Date, endDate: Date): Promise<AdminSalesPerformance[]> {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    
    return Array.from(this.adminSalesPerformance.values())
      .filter(record => {
        const recordDate = new Date(record.date).getTime();
        return record.adminId === adminId && recordDate >= start && recordDate <= end;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  
  async getTopPerformingAdmins(limit: number = 5, startDate?: Date, endDate?: Date): Promise<AdminSalesPerformance[]> {
    let records = Array.from(this.adminSalesPerformance.values());
    
    // Filter by date range if provided
    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      
      records = records.filter(record => {
        const recordDate = new Date(record.date).getTime();
        return recordDate >= start && recordDate <= end;
      });
    }
    
    // Group by admin and sum up sales
    const adminTotals = new Map<number, AdminSalesPerformance>();
    
    records.forEach(record => {
      const existing = adminTotals.get(record.adminId);
      
      if (existing) {
        // Update existing total
        existing.salesTotal += record.salesTotal;
        existing.salesCount += record.salesCount;
        existing.ordersProcessed += record.ordersProcessed;
        existing.customersServed += record.customersServed;
        
        // Recalculate average
        if (existing.salesCount > 0) {
          existing.averageOrderValue = existing.salesTotal / existing.salesCount;
        }
      } else {
        // Create new total
        adminTotals.set(record.adminId, {
          ...record,
          date: new Date() // Use current date for the aggregated record
        });
      }
    });
    
    // Convert to array and sort by sales total
    return Array.from(adminTotals.values())
      .sort((a, b) => b.salesTotal - a.salesTotal)
      .slice(0, limit);
  }
  
  // Product methods
  async getProduct(id: number): Promise<Product | undefined> {
    return this.products.get(id);
  }
  
  async getProducts(options?: {
    category?: string;
    subcategory?: string;
    brand?: string;
    brandType?: string;
    featured?: boolean;
    isNewArrival?: boolean;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    inStoreAvailable?: boolean;
    search?: string;
  }): Promise<Product[]> {
    let products = Array.from(this.products.values());
    
    if (options) {
      if (options.category) {
        products = products.filter(product => product.category === options.category);
      }
      
      if (options.subcategory) {
        products = products.filter(product => product.subcategory === options.subcategory);
      }
      
      if (options.brand) {
        products = products.filter(product => product.brand === options.brand);
      }
      
      if (options.brandType) {
        products = products.filter(product => product.brandType === options.brandType);
      }
      
      if (options.featured !== undefined) {
        products = products.filter(product => product.featured === options.featured);
      }
      
      if (options.isNewArrival !== undefined) {
        products = products.filter(product => product.isNewArrival === options.isNewArrival);
      }
      
      if (options.minPrice !== undefined) {
        products = products.filter(product => product.price >= options.minPrice!);
      }
      
      if (options.maxPrice !== undefined) {
        products = products.filter(product => product.price <= options.maxPrice!);
      }
      
      if (options.inStock !== undefined) {
        products = products.filter(product => product.inStock === options.inStock);
      }
      
      if (options.inStoreAvailable !== undefined) {
        products = products.filter(product => product.inStoreAvailable === options.inStoreAvailable);
      }
      
      // Search functionality
      if (options.search) {
        const searchTerm = options.search.toLowerCase();
        products = products.filter(product => {
          return (
            product.name.toLowerCase().includes(searchTerm) ||
            product.description.toLowerCase().includes(searchTerm) ||
            product.brand.toLowerCase().includes(searchTerm) ||
            product.category.toLowerCase().includes(searchTerm) ||
            (product.subcategory && product.subcategory.toLowerCase().includes(searchTerm)) ||
            (product.brandType && product.brandType.toLowerCase().includes(searchTerm))
          );
        });
      }
    }
    
    return products;
  }
  
  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = this.currentProductId++;
    const now = new Date();
    const product: Product = { 
      ...insertProduct, 
      id,
      createdAt: now
    };
    this.products.set(id, product);
    return product;
  }
  
  async updateProduct(id: number, productData: Partial<Product>): Promise<Product | undefined> {
    const product = await this.getProduct(id);
    if (!product) return undefined;
    
    const updatedProduct = { ...product, ...productData };
    this.products.set(id, updatedProduct);
    return updatedProduct;
  }
  
  async updateProductQuantity(id: number, quantity: number): Promise<Product | undefined> {
    const product = await this.getProduct(id);
    if (!product) return undefined;
    
    // Update quantity and inStock status
    const updatedProduct = { 
      ...product, 
      quantity: quantity,
      inStock: quantity > 0
    };
    
    // Update the product in storage
    this.products.set(id, updatedProduct);
    
    return updatedProduct;
  }
  
  async deleteProduct(id: number): Promise<boolean> {
    return this.products.delete(id);
  }
  
  // Cart methods
  async getCartItems(userId: number): Promise<CartItem[]> {
    return Array.from(this.cartItems.values()).filter(item => item.userId === userId);
  }
  
  async getCartItemWithProduct(cartItemId: number): Promise<(CartItem & { product: Product }) | undefined> {
    const cartItem = this.cartItems.get(cartItemId);
    if (!cartItem) return undefined;
    
    const product = this.products.get(cartItem.productId);
    if (!product) return undefined;
    
    return { ...cartItem, product };
  }
  
  async getCartItemsByUserWithProducts(userId: number): Promise<(CartItem & { product: Product })[]> {
    const cartItems = await this.getCartItems(userId);
    return cartItems.map(item => {
      const product = this.products.get(item.productId)!;
      return { ...item, product };
    }).filter(item => item.product !== undefined);
  }
  
  async getCartItem(id: number): Promise<CartItem | undefined> {
    return this.cartItems.get(id);
  }
  
  async addToCart(insertCartItem: InsertCartItem): Promise<CartItem> {
    // Check if the product is already in the cart
    const existingItem = Array.from(this.cartItems.values()).find(
      item => item.userId === insertCartItem.userId && item.productId === insertCartItem.productId
    );
    
    if (existingItem) {
      // Update quantity instead of adding a new item
      return this.updateCartItem(existingItem.id, existingItem.quantity + insertCartItem.quantity) as Promise<CartItem>;
    }
    
    const id = this.currentCartItemId++;
    const cartItem: CartItem = { ...insertCartItem, id };
    this.cartItems.set(id, cartItem);
    return cartItem;
  }
  
  async updateCartItem(id: number, quantity: number): Promise<CartItem | undefined> {
    const cartItem = await this.getCartItem(id);
    if (!cartItem) return undefined;
    
    const updatedCartItem = { ...cartItem, quantity };
    this.cartItems.set(id, updatedCartItem);
    return updatedCartItem;
  }
  
  async removeFromCart(id: number): Promise<boolean> {
    return this.cartItems.delete(id);
  }
  
  async clearCart(userId: number): Promise<boolean> {
    const cartItems = await this.getCartItems(userId);
    cartItems.forEach(item => this.cartItems.delete(item.id));
    return true;
  }
  
  // Wishlist methods
  async getWishlistItems(userId: number): Promise<WishlistItem[]> {
    return Array.from(this.wishlistItems.values()).filter(item => item.userId === userId);
  }
  
  async getWishlistItemsByUserWithProducts(userId: number): Promise<(WishlistItem & { product: Product })[]> {
    const wishlistItems = await this.getWishlistItems(userId);
    return wishlistItems.map(item => {
      const product = this.products.get(item.productId)!;
      return { ...item, product };
    }).filter(item => item.product !== undefined);
  }
  
  async addToWishlist(insertWishlistItem: InsertWishlistItem): Promise<WishlistItem> {
    // Check if the product is already in the wishlist
    const existingItem = Array.from(this.wishlistItems.values()).find(
      item => item.userId === insertWishlistItem.userId && item.productId === insertWishlistItem.productId
    );
    
    if (existingItem) {
      return existingItem;
    }
    
    const id = this.currentWishlistItemId++;
    const wishlistItem: WishlistItem = { ...insertWishlistItem, id };
    this.wishlistItems.set(id, wishlistItem);
    return wishlistItem;
  }
  
  async removeFromWishlist(id: number): Promise<boolean> {
    return this.wishlistItems.delete(id);
  }
  
  // Order methods
  async getOrder(id: number): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order || order.isArchived) return undefined;
    return order;
  }
  
  async getOrderByTrackingNumber(trackingNumber: string): Promise<Order | undefined> {
    return Array.from(this.orders.values()).find(order => 
      order.trackingNumber === trackingNumber && !order.isArchived
    );
  }
  
  async updateOrder(id: number, orderData: Partial<Order>): Promise<Order | undefined> {
    const order = await this.getOrder(id);
    if (!order) return undefined;
    
    const updatedOrder = { ...order, ...orderData, updatedAt: new Date() };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }
  
  async getOrders(
    options: {
      userId?: number, 
      adminId?: number,
      includeArchived?: boolean, 
      fromDate?: Date, 
      toDate?: Date,
      orderType?: 'all' | 'online' | 'in-store',
      includeItems?: boolean
    } = {}
  ): Promise<Order[] | (Order & { items: (OrderItem & { product: Product })[] })[]> {
    const {
      userId,
      adminId,
      includeArchived = false,
      fromDate,
      toDate,
      orderType = 'all',
      includeItems = false
    } = options;
    
    let orders = Array.from(this.orders.values());
    
    // Filter by user ID if provided
    if (userId) {
      orders = orders.filter(order => order.userId === userId);
    }
    
    // Filter by admin ID if provided (for admin who processed the order)
    if (adminId) {
      orders = orders.filter(order => order.processingAdminId === adminId);
    }
    
    // Filter by order type (online/in-store)
    if (orderType !== 'all') {
      const isInStore = orderType === 'in-store';
      orders = orders.filter(order => order.isInStorePurchase === isInStore);
    }
    
    // Filter out archived orders unless specifically requested
    if (!includeArchived) {
      orders = orders.filter(order => !order.isArchived);
    }
    
    // Filter by date range if provided
    if (fromDate) {
      orders = orders.filter(order => new Date(order.createdAt) >= fromDate);
    }
    
    if (toDate) {
      orders = orders.filter(order => new Date(order.createdAt) <= toDate);
    }
    
    // Sort orders by created date (newest first)
    orders = orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Include order items if requested
    if (includeItems) {
      const ordersWithItems = orders.map(order => {
        const orderItems = Array.from(this.orderItems.values())
          .filter(item => item.orderId === order.id)
          .map(item => {
            const product = this.products.get(item.productId)!;
            return { ...item, product };
          });
        
        return { ...order, items: orderItems };
      });
      
      return ordersWithItems as (Order & { items: (OrderItem & { product: Product })[] })[];
    }
    
    return orders;
  }
  
  async getOrderWithItems(orderId: number): Promise<(Order & { items: (OrderItem & { product: Product })[] }) | undefined> {
    const order = await this.getOrder(orderId);
    if (!order) return undefined;
    
    const orderItems = await this.getOrderItems(orderId);
    const items = orderItems.map(item => {
      const product = this.products.get(item.productId)!;
      return { ...item, product };
    });
    
    return { ...order, items };
  }
  
  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const id = this.currentOrderId++;
    const now = new Date();
    
    // Calculate expiry date (3 months from now)
    const expiryDate = new Date(now);
    expiryDate.setMonth(expiryDate.getMonth() + 3);
    
    // Include tracking number in the order if not already provided
    const trackingNumber = insertOrder.trackingNumber || null;
    
    const order: Order = { 
      ...insertOrder, 
      id,
      createdAt: now,
      updatedAt: now,
      expiryDate,
      isArchived: false,
      // Include tracking number
      trackingNumber,
      // Ensure isInStorePurchase is properly set (default to false if not provided)
      isInStorePurchase: insertOrder.isInStorePurchase || false,
      // Ensure other required fields have default values if not provided
      status: insertOrder.status || 'pending',
      paymentStatus: insertOrder.paymentStatus || 'pending',
    };
    this.orders.set(id, order);
    
    // If this is an in-store purchase created by an admin, update their sales count
    if (order.isInStorePurchase && order.processingAdminId) {
      await this.incrementAdminSalesCount(order.processingAdminId, order.totalAmount);
    }
    
    return order;
  }
  
  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    const order = await this.getOrder(id);
    if (!order) return undefined;
    
    const now = new Date();
    const updatedOrder = { 
      ...order, 
      status,
      updatedAt: now
    };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }
  
  async updateDeliveryStatus(id: number, status: string): Promise<Order | undefined> {
    const order = await this.getOrder(id);
    if (!order) return undefined;
    
    const now = new Date();
    const updatedOrder = { 
      ...order, 
      deliveryStatus: status,
      updatedAt: now
    };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }
  
  async updatePaymentStatus(id: number, paymentStatus: string): Promise<Order | undefined> {
    const order = await this.getOrder(id);
    if (!order) return undefined;
    
    const now = new Date();
    const updatedOrder = { 
      ...order, 
      paymentStatus,
      updatedAt: now
    };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }
  
  async updateTrackingNumber(id: number, trackingNumber: string): Promise<Order | undefined> {
    const order = await this.getOrder(id);
    if (!order) return undefined;
    
    const now = new Date();
    const updatedOrder = { 
      ...order, 
      trackingNumber,
      updatedAt: now
    };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }
  
  async updateOrderAdmin(id: number, adminId: number, adminName: string): Promise<Order | undefined> {
    const order = await this.getOrder(id);
    if (!order) return undefined;
    
    const now = new Date();
    const updatedOrder = { 
      ...order, 
      processingAdminId: adminId,
      processingAdminName: adminName,
      updatedAt: now
    };
    this.orders.set(id, updatedOrder);
    
    // Also increment the admin's sales count
    await this.incrementAdminSalesCount(adminId);
    
    return updatedOrder;
  }
  
  async getOrdersNeedingNotification(): Promise<Order[]> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    
    return Array.from(this.orders.values()).filter(order => {
      // Order should be in "Shipped" delivery status
      if (order.deliveryStatus !== 'Shipped') return false;
      
      // Order should have a valid tracking number
      if (!order.trackingNumber) return false;
      
      // Either no notification sent yet or last notification was sent more than 1 hour ago
      // and notification count is less than 3
      return (!order.lastNotificationSent || 
        (new Date(order.lastNotificationSent) < oneHourAgo && 
        (order.notificationCount || 0) < 3));
    });
  }
  
  async updateOrderNotification(id: number): Promise<Order | undefined> {
    const order = await this.getOrder(id);
    if (!order) return undefined;
    
    const now = new Date();
    const currentCount = order.notificationCount || 0;
    
    const updatedOrder = { 
      ...order, 
      lastNotificationSent: now,
      notificationCount: currentCount + 1,
      updatedAt: now
    };
    
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }
  
  async archiveExpiredOrders(): Promise<number> {
    const now = new Date();
    const orders = Array.from(this.orders.values());
    let archivedCount = 0;
    
    for (const order of orders) {
      if (!order.isArchived && order.expiryDate && new Date(order.expiryDate) <= now) {
        const archivedOrder = { ...order, isArchived: true, updatedAt: now };
        this.orders.set(order.id, archivedOrder);
        archivedCount++;
      }
    }
    
    return archivedCount;
  }
  
  async deleteArchivedOrders(): Promise<number> {
    const orders = Array.from(this.orders.values());
    let deletedCount = 0;
    
    for (const order of orders) {
      if (order.isArchived) {
        this.orders.delete(order.id);
        deletedCount++;
      }
    }
    
    return deletedCount;
  }
  
  // Order items methods
  async createOrderItem(insertOrderItem: InsertOrderItem): Promise<OrderItem> {
    const id = this.currentOrderItemId++;
    const orderItem: OrderItem = { ...insertOrderItem, id };
    this.orderItems.set(id, orderItem);
    return orderItem;
  }
  
  async getOrderItems(orderId: number): Promise<OrderItem[]> {
    return Array.from(this.orderItems.values()).filter(item => item.orderId === orderId);
  }
  
  // Coupon methods
  async getCoupon(code: string): Promise<Coupon | undefined> {
    return Array.from(this.coupons.values()).find(coupon => coupon.code === code);
  }
  
  async createCoupon(insertCoupon: InsertCoupon): Promise<Coupon> {
    const id = this.currentCouponId++;
    const coupon: Coupon = { ...insertCoupon, id };
    this.coupons.set(id, coupon);
    return coupon;
  }
  
  async updateCoupon(id: number, couponData: Partial<Coupon>): Promise<Coupon | undefined> {
    const coupon = this.coupons.get(id);
    if (!coupon) return undefined;
    
    const updatedCoupon = { ...coupon, ...couponData };
    this.coupons.set(id, updatedCoupon);
    return updatedCoupon;
  }
  
  async deleteCoupon(id: number): Promise<boolean> {
    return this.coupons.delete(id);
  }
  
  // Temporary access token methods
  async createTempAccessToken(insertToken: InsertTempAccessToken): Promise<TempAccessToken> {
    const id = this.currentTempAccessTokenId++;
    const token: TempAccessToken = { 
      ...insertToken, 
      id,
      isActive: true,
      createdAt: new Date(),
      usedAt: null
    };
    this.tempAccessTokens.set(id, token);
    return token;
  }
  
  async getTempAccessToken(tokenStr: string): Promise<TempAccessToken | undefined> {
    return Array.from(this.tempAccessTokens.values()).find(token => 
      token.token === tokenStr && token.isActive && new Date() < new Date(token.expiresAt)
    );
  }
  
  async markTempAccessTokenUsed(tokenStr: string): Promise<TempAccessToken | undefined> {
    const token = Array.from(this.tempAccessTokens.values()).find(token => token.token === tokenStr);
    if (!token) return undefined;
    
    const now = new Date();
    const updatedToken = { ...token, usedAt: now, isActive: false };
    this.tempAccessTokens.set(token.id, updatedToken);
    return updatedToken;
  }
  
  async invalidateTempAccessToken(tokenStr: string): Promise<boolean> {
    const token = Array.from(this.tempAccessTokens.values()).find(token => token.token === tokenStr);
    if (!token) return false;
    
    const updatedToken = { ...token, isActive: false };
    this.tempAccessTokens.set(token.id, updatedToken);
    return true;
  }
  
  async getAdminTempAccessTokens(adminId: number): Promise<TempAccessToken[]> {
    return Array.from(this.tempAccessTokens.values())
      .filter(token => token.createdBy === adminId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async cleanupExpiredTokens(): Promise<number> {
    const now = new Date();
    const tokens = Array.from(this.tempAccessTokens.values());
    let expiredCount = 0;
    
    for (const token of tokens) {
      if (new Date(token.expiresAt) < now) {
        this.tempAccessTokens.delete(token.id);
        expiredCount++;
      }
    }
    
    return expiredCount;
  }
  
  // Deposit methods implementation
  async createDeposit(insertDeposit: InsertDeposit): Promise<Deposit> {
    const id = this.currentDepositId++;
    const now = new Date();
    
    const deposit: Deposit = {
      ...insertDeposit,
      id,
      createdAt: now,
      updatedAt: now,
      // Ensure remaining fields are properly initialized
      depositDate: insertDeposit.depositDate || now,
      status: insertDeposit.status || 'pending'
    };
    
    this.deposits.set(id, deposit);
    return deposit;
  }
  
  async getDeposit(id: number): Promise<Deposit | undefined> {
    return this.deposits.get(id);
  }
  
  async getDeposits(options?: {
    adminId?: number;
    customerId?: number;
    status?: string;
    productId?: number;
  }): Promise<Deposit[]> {
    let deposits = Array.from(this.deposits.values());
    
    if (options) {
      if (options.adminId !== undefined) {
        deposits = deposits.filter(deposit => deposit.adminId === options.adminId);
      }
      
      if (options.customerId !== undefined) {
        deposits = deposits.filter(deposit => deposit.customerId === options.customerId);
      }
      
      if (options.status !== undefined) {
        deposits = deposits.filter(deposit => deposit.status === options.status);
      }
      
      if (options.productId !== undefined) {
        deposits = deposits.filter(deposit => deposit.productId === options.productId);
      }
    }
    
    return deposits;
  }
  
  async getDepositWithProduct(depositId: number): Promise<(Deposit & { product: Product }) | undefined> {
    const deposit = await this.getDeposit(depositId);
    if (!deposit) return undefined;
    
    const product = await this.getProduct(deposit.productId);
    if (!product) return undefined;
    
    return { ...deposit, product };
  }
  
  async updateDepositStatus(id: number, status: string): Promise<Deposit | undefined> {
    const deposit = await this.getDeposit(id);
    if (!deposit) return undefined;
    
    const updatedDeposit = { 
      ...deposit, 
      status,
      updatedAt: new Date()
    };
    
    this.deposits.set(id, updatedDeposit);
    return updatedDeposit;
  }
  
  async completeDeposit(id: number, paymentDetails: {
    paymentMethod: string;
    completedAt?: Date;
  }): Promise<Deposit | undefined> {
    const deposit = await this.getDeposit(id);
    if (!deposit) return undefined;
    
    const now = paymentDetails.completedAt || new Date();
    
    const updatedDeposit = { 
      ...deposit, 
      status: 'completed',
      completedAt: now,
      updatedAt: now,
      paymentMethod: paymentDetails.paymentMethod
    };
    
    this.deposits.set(id, updatedDeposit);
    
    // Update the product inventory if needed
    const product = await this.getProduct(deposit.productId);
    if (product) {
      // Decrement store quantity since item is now sold
      const storeQuantity = Math.max(0, (product.storeQuantity || 0) - 1);
      await this.updateProduct(product.id, { storeQuantity });
      
      // Increment admin sales count
      await this.incrementAdminSalesCount(deposit.adminId);
    }
    
    return updatedDeposit;
  }
  
  async processRefund(id: number, refundDetails: {
    refundAmount: number;
    refundReason: string;
    refundedAt?: Date;
  }): Promise<Deposit | undefined> {
    const deposit = await this.getDeposit(id);
    if (!deposit) return undefined;
    
    const now = refundDetails.refundedAt || new Date();
    
    const updatedDeposit = { 
      ...deposit, 
      status: 'refunded',
      refundedAt: now,
      refundAmount: refundDetails.refundAmount,
      refundReason: refundDetails.refundReason,
      updatedAt: now
    };
    
    this.deposits.set(id, updatedDeposit);
    return updatedDeposit;
  }
  
  // Helper method to get orders by user
  async getOrdersByUser(userId: number): Promise<Order[]> {
    return Array.from(this.orders.values()).filter(order => order.userId === userId);
  }
  
  // Helper method to get wishlist by user
  async getWishlistItemsByUser(userId: number): Promise<WishlistItem[]> {
    return Array.from(this.wishlistItems.values()).filter(item => item.userId === userId);
  }
  
  // User insights methods
  async getUserInsights(userId: number): Promise<any> {
    const user = await this.getUser(userId);
    if (!user) {
      return {}; // Return empty object if user not found
    }
    
    // Get user orders
    const userOrders = await this.getOrdersByUser(userId);
    
    // Get user wishlist
    const wishlistItems = await this.getWishlistItemsByUserWithProducts(userId);
    
    // Category breakdown based on purchase history
    const categoryBreakdown = this.getCategoryBreakdownFromOrders(userOrders);
    
    // Calculate wishlist items that are on sale
    const wishlistItemsOnSale = wishlistItems
      .filter(item => item.product.discountPrice !== null && item.product.discountPercentage !== null)
      .map(item => {
        const daysRemaining = item.product.discountEndDate ? 
          Math.max(0, Math.ceil((new Date(item.product.discountEndDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))) : 0;
          
        return {
          id: item.product.id,
          name: item.product.name,
          price: item.product.price,
          discountPrice: item.product.discountPrice,
          discountPercentage: item.product.discountPercentage,
          images: item.product.images,
          daysRemaining
        };
      });
      
    // Get upcoming sales events
    const currentDate = new Date();
    const upcomingEvents = [
      {
        name: "Summer Sale",
        startDate: new Date(currentDate.getFullYear(), 5, 15), // June 15
        endDate: new Date(currentDate.getFullYear(), 6, 15),   // July 15
        discountPercentage: 30,
        description: "Up to 30% off on summer collections"
      },
      {
        name: "Anniversary Sale",
        startDate: new Date(currentDate.getFullYear(), 7, 1),  // August 1
        endDate: new Date(currentDate.getFullYear(), 7, 14),   // August 14
        discountPercentage: 40,
        description: "Exclusive discounts on premium items"
      },
      {
        name: "Black Friday",
        startDate: new Date(currentDate.getFullYear(), 10, 24), // November 24
        endDate: new Date(currentDate.getFullYear(), 10, 30),   // November 30
        discountPercentage: 50,
        description: "Biggest sale of the year!"
      }
    ].filter(event => new Date(event.startDate) > currentDate)
     .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    
    return {
      categoryBreakdown,
      wishlistItemsOnSale,
      upcomingEvents: upcomingEvents.slice(0, 3) // Return only next 3 events
    };
  }
  
  async getUserActivityStats(userId: number): Promise<any> {
    const user = await this.getUser(userId);
    if (!user) {
      return {}; // Return empty object if user not found
    }
    
    // Get user orders
    const userOrders = await this.getOrdersByUser(userId);
    
    // Get wishlist items count
    const wishlistItems = await this.getWishlistItemsByUser(userId);
    
    // Calculate total spent
    const totalSpent = userOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    
    // Calculate average order value
    const averageOrderValue = userOrders.length > 0 ? totalSpent / userOrders.length : 0;
    
    // Get most recent purchase date
    const sortedOrders = [...userOrders].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const lastPurchaseDate = sortedOrders.length > 0 ? sortedOrders[0].createdAt : null;
    
    // Calculate next loyalty threshold
    const nextLoyaltyThreshold = this.calculateNextLoyaltyThreshold(totalSpent);
    
    // Generate monthly spending data for the last 6 months
    const monthlySpendings = this.generateMonthlySpendings(userOrders);
    
    return {
      totalOrders: userOrders.length,
      totalSpent,
      averageOrderValue,
      lastPurchaseDate,
      wishlistCount: wishlistItems.length,
      reviewCount: 0, // Placeholder for review count (to be implemented later)
      nextLoyaltyThreshold,
      monthlySpendings
    };
  }
  
  // Helper methods for user insights
  private getCategoryBreakdownFromOrders(orders: Order[]): { category: string; count: number }[] {
    // Map to store category counts
    const categoryMap = new Map<string, number>();
    
    // Process each order to extract categories
    orders.forEach(order => {
      // Get order items with products
      const orderItems = Array.from(this.orderItems.values())
        .filter(item => item.orderId === order.id);
        
      // Get products for each order item
      orderItems.forEach(item => {
        const product = this.products.get(item.productId);
        if (product) {
          const category = product.category;
          categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
        }
      });
    });
    
    // Convert map to array and sort by count (descending)
    return Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }
  
  private calculateNextLoyaltyThreshold(totalSpent: number): number {
    if (totalSpent > 500000) return 0; // Diamond tier - no higher tier
    if (totalSpent > 250000) return 500000 - totalSpent; // Platinum to Diamond
    if (totalSpent > 100000) return 250000 - totalSpent; // Gold to Platinum
    if (totalSpent > 50000) return 100000 - totalSpent; // Silver to Gold
    return 50000 - totalSpent; // Bronze to Silver
  }
  
  private generateMonthlySpendings(orders: Order[]): { month: string; amount: number }[] {
    const result: { month: string; amount: number }[] = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Get last 6 months
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(today.getMonth() - i);
      const monthYear = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
      
      // Calculate start and end of month
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      // Filter orders for this month
      const monthOrders = orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startOfMonth && orderDate <= endOfMonth;
      });
      
      // Sum order amounts
      const amount = monthOrders.reduce((sum, order) => sum + order.totalAmount, 0);
      
      result.push({ month: monthYear, amount });
    }
    
    return result;
  }
  
  // Seed products
  private async seedProducts() {
    // Sample product data
    const productData: InsertProduct[] = [
      {
        name: "Classic Leather Tote",
        description: "Elegant leather tote bag with spacious interior and premium craftsmanship.",
        price: 125000,
        discountPrice: 99000,
        discountPercentage: 20,
        discountEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        category: "bags",
        subcategory: "tote",
        brand: "Luxury Brand",
        brandType: "Luxury Brand",
        barcode: "9781234567897",
        sku: "LUX-BAG-1-123",
        inStoreAvailable: true,
        storeQuantity: 15,
        images: [
          "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1584917865442-de89df76afd3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1559563458-527698bf5295?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTV8fGxlYXRoZXIlMjB0b3RlfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8bGVhdGhlciUyMHRvdGV8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Black", "Brown", "Tan"],
        sizes: ["One Size"],
        rating: 4.7,
        reviewCount: 124,
        specifications: {
          dimensions: "14 x 11 x 5 inches",
          weight: "2.5 lbs",
          material: "Full-grain leather",
          pockets: "3 interior, 1 exterior"
        },
        material: "Premium full-grain Italian leather",
        careInstructions: "Clean with a soft, dry cloth. Apply leather conditioner every 3-6 months.",
        inStock: true,
        quantity: 50,
        featured: true,
        isNewArrival: true
      },
      {
        name: "Elegant Evening Dress",
        description: "Stunning evening dress with delicate embroidery and flattering silhouette.",
        price: 89500,
        discountPercentage: 15,
        discountEndDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        category: "clothing",
        subcategory: "dresses",
        brand: "Designer Collection",
        brandType: "Designer Collection",
        barcode: "9781234567903",
        sku: "DES-DRS-1-456",
        inStoreAvailable: true,
        storeQuantity: 8,
        images: [
          "https://images.unsplash.com/photo-1539533018447-63fcce2678e3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1546052646-a88eafec0399?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8ZXZlbmluZyUyMGRyZXNzfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1562137369-1a1a0bc66744?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTZ8fGV2ZW5pbmclMjBkcmVzc3xlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Black", "Red", "Navy"],
        sizes: ["XS", "S", "M", "L"],
        rating: 4.5,
        reviewCount: 42,
        specifications: {
          material: "Silk blend with hand-sewn embroidery",
          length: "Floor length",
          closure: "Concealed back zipper",
          features: "Fitted bodice, flared skirt"
        },
        material: "Silk blend fabric with delicate embroidery",
        careInstructions: "Dry clean only. Store in a garment bag.",
        inStock: true,
        quantity: 20,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Tailored Wool Blazer",
        description: "Premium men's blazer with sophisticated cut and luxurious wool fabric.",
        price: 175000,
        discountPrice: 129000,
        discountPercentage: 26,
        discountEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        category: "clothing",
        subcategory: "men",
        brand: "Premium Menswear",
        brandType: "Premium Menswear",
        images: [
          "https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1506863132118-fcf8845dc2a3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8bWVucyUyMGJsYXplcnxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1541846120071-60933f8a0bf7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fG1lbnMlMjBibGF6ZXJ8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1593032465175-481ac7f401a0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVucyUyMGJsYXplcnxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1515290522655-329c332190e3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8bWVucyUyMGJsYXplcnxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Navy", "Charcoal", "Black"],
        sizes: ["S", "M", "L", "XL"],
        rating: 4.9,
        reviewCount: 78,
        specifications: {
          material: "100% Italian wool",
          lining: "Silk blend",
          buttons: "Horn",
          pockets: "3 exterior, 3 interior"
        },
        material: "Premium Italian wool with luxury lining",
        careInstructions: "Dry clean only. Store on a padded hanger.",
        inStock: true,
        quantity: 15,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Premium Cotton Button-Down Shirt",
        description: "Classic men's button-down shirt made from premium Egyptian cotton with perfect fit and durability.",
        price: 65000,
        discountPrice: 52000,
        discountPercentage: 20,
        discountEndDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
        category: "clothing",
        subcategory: "men",
        brand: "Premium Menswear",
        brandType: "Premium Menswear",
        images: [
          "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fG1lbnMlMjBzaGlydHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1604695573706-53170668f6a6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTl8fG1lbnMlMjBzaGlydHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1626497764746-6dc36546b388?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVucyUyMGJ1dHRvbiUyMGRvd24lMjBzaGlydHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1603252109303-2751441dd157?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8bWVucyUyMGJ1dHRvbiUyMGRvd24lMjBzaGlydHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["White", "Light Blue", "Navy", "Burgundy"],
        sizes: ["S", "M", "L", "XL", "XXL"],
        rating: 4.7,
        reviewCount: 156,
        specifications: {
          material: "100% Egyptian cotton",
          collar: "Button-down collar",
          cuffs: "Adjustable button cuffs",
          pattern: "Solid colors and minimal patterns"
        },
        material: "Premium Egyptian cotton, 120 thread count",
        careInstructions: "Machine washable. Warm iron if needed. Do not bleach.",
        inStock: true,
        quantity: 45,
        featured: false,
        isNewArrival: true
      },
      {
        name: "Designer Slim-Fit Jeans",
        description: "Contemporary men's slim-fit jeans with premium denim and perfect stretch comfort.",
        price: 85000,
        category: "clothing",
        subcategory: "men",
        brand: "Urban Premium",
        brandType: "Urban Premium",
        images: [
          "https://images.unsplash.com/photo-1542272604-787c3835535d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1555689502-c4b22d76c56f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fG1lbnMlMjBqZWFuc3xlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1560343776-97e7d202ff0e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8bWVucyUyMGplYW5zfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1605518216938-7c31b7b14ad0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTh8fG1lbnMlMjBqZWFuc3xlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1604176424472-3e749cba4d9e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVucyUyMGplYW5zfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Dark Blue", "Black", "Light Wash", "Medium Wash"],
        sizes: ["30x32", "32x32", "32x34", "34x32", "34x34", "36x32", "36x34"],
        rating: 4.6,
        reviewCount: 218,
        specifications: {
          material: "98% Cotton, 2% Elastane",
          rise: "Mid-rise",
          fit: "Slim fit through hip and thigh",
          pockets: "5-pocket styling"
        },
        material: "Premium stretch denim with comfort technology",
        careInstructions: "Machine wash cold with like colors. Tumble dry low.",
        inStock: true,
        quantity: 75,
        featured: true,
        isNewArrival: true
      },
      {
        name: "Cashmere Crew Neck Sweater",
        description: "Ultra-soft men's cashmere sweater with classic crew neck design and timeless style.",
        price: 145000,
        discountPrice: 115000,
        discountPercentage: 20,
        discountEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        category: "clothing",
        subcategory: "men",
        brand: "Classic Luxury",
        brandType: "Classic Luxury",
        images: [
          "https://images.unsplash.com/photo-1539185441755-769473a23570?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1608063615781-e2ef8c73d114?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTN8fG1lbnMlMjBzd2VhdGVyfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8Y2FzaG1lcmV8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1511105043137-7e66f28270e3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8Y2FzaG1lcmV8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1581349485608-9469926a8e5e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTZ8fG1lbnMlMjBzd2VhdGVyfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Navy", "Gray", "Black", "Burgundy", "Forest Green"],
        sizes: ["S", "M", "L", "XL", "XXL"],
        rating: 4.8,
        reviewCount: 95,
        specifications: {
          material: "100% Grade-A Mongolian Cashmere",
          weight: "Medium weight, 2-ply yarn",
          neck: "Crew neck",
          hem: "Ribbed cuffs and hem"
        },
        material: "Pure Grade-A Mongolian Cashmere",
        careInstructions: "Hand wash cold or dry clean. Lay flat to dry. Store folded with cedar blocks.",
        inStock: true,
        quantity: 35,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Italian Leather Derby Shoes",
        description: "Handcrafted men's derby shoes made from premium Italian leather with Goodyear welt construction.",
        price: 195000,
        category: "clothing",
        subcategory: "men",
        brand: "Classic Luxury",
        brandType: "Classic Luxury",
        images: [
          "https://images.unsplash.com/photo-1614253243020-eaf46fd43b6a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1613237636790-6e4f58937d92?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8bWVucyUyMGxlYXRoZXIlMjBzaG9lc3xlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1591741873864-74bef2160589?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fG1lbnMlMjBsZWF0aGVyJTIwc2hvZXN8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1531310197839-ccf54634509e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8bWVucyUyMGxlYXRoZXIlMjBzaG9lc3xlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1606753930828-fdcc943a273e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjB8fG1lbnMlMjBsZWF0aGVyJTIwc2hvZXN8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Black", "Dark Brown", "Tan", "Oxblood"],
        sizes: ["40", "41", "42", "43", "44", "45", "46"],
        rating: 4.9,
        reviewCount: 132,
        specifications: {
          material: "Full-grain Italian calfskin leather",
          sole: "Leather sole with rubber insert",
          construction: "Goodyear welt",
          lining: "Full leather lining"
        },
        material: "Full-grain Italian calfskin leather with leather lining",
        careInstructions: "Clean with a soft cloth. Use quality shoe cream and leather conditioner. Store with shoe trees.",
        inStock: true,
        quantity: 25,
        featured: false,
        isNewArrival: true
      },
      {
        name: "Merino Wool Polo Shirt",
        description: "Luxurious men's polo shirt made from ultra-fine merino wool for year-round comfort and style.",
        price: 75000,
        discountPrice: 59000,
        discountPercentage: 21,
        discountEndDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        category: "clothing",
        subcategory: "men",
        brand: "Premium Menswear",
        brandType: "Premium Menswear",
        images: [
          "https://images.unsplash.com/photo-1599577180589-0a8f0d4f23f8?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fHBvbG8lMjBzaGlydHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8bWVucyUyMHBvbG98ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1571455786673-9d9d6c194f90?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fG1lbnMlMjBwb2xvfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1560243563-062bfc001d68?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTV8fG1lbnMlMjBwb2xvfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Navy", "Charcoal", "Forest Green", "Burgundy", "Sky Blue"],
        sizes: ["S", "M", "L", "XL", "XXL"],
        rating: 4.7,
        reviewCount: 104,
        specifications: {
          material: "100% ultra-fine Merino wool",
          weight: "Lightweight 180g/m²",
          collar: "Ribbed collar and cuffs",
          features: "Moisture-wicking, odor-resistant, temperature regulating"
        },
        material: "Ultra-fine Merino wool from sustainable sources",
        careInstructions: "Machine washable on wool cycle. Lay flat to dry.",
        inStock: true,
        quantity: 40,
        featured: true,
        isNewArrival: true
      },
      {
        name: "Diamond Pendant Necklace",
        description: "Exquisite diamond pendant necklace set in 18k gold with brilliant cut stones.",
        price: 350000,
        category: "jewelry",
        subcategory: "necklaces",
        brand: "Fine Jewelry",
        brandType: "Fine Jewelry",
        images: [
          "https://images.unsplash.com/photo-1611085583191-a3b181a88401?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1620898995040-78d91161fcab?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTV8fGRpYW1vbmQlMjBuZWNrbGFjZXxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OXx8ZGlhbW9uZCUyMG5lY2tsYWNlfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80"
        ],
        inStock: true,
        quantity: 5,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Silk Evening Gown",
        description: "Luxurious silk gown with hand-sewn embellishments and elegant train.",
        price: 250000,
        category: "clothing",
        subcategory: "gowns",
        brand: "Haute Couture",
        brandType: "Haute Couture",
        images: [
          "https://images.unsplash.com/photo-1566206091558-7f218b696731?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=400&q=80",
          "https://images.unsplash.com/photo-1594575590101-7165c83fdb55?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8ZXZlbmluZyUyMGdvd258ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1623003697233-a1e1bf4e5b68?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGV2ZW5pbmclMjBnb3dufGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80"
        ],
        inStock: true,
        quantity: 8,
        featured: false,
        isNewArrival: true
      },
      {
        name: "Structured Leather Handbag",
        description: "Contemporary leather handbag with architectural design and gold hardware.",
        price: 95000,
        category: "bags",
        subcategory: "handbags",
        brand: "Modern Luxury",
        brandType: "Modern Luxury",
        images: [
          "https://images.unsplash.com/photo-1584917865442-de89df76afd3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1575026651580-52dd81b26802?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTZ8fGxlYXRoZXIlMjBoYW5kYmFnfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OXx8bGVhdGhlciUyMGhhbmRiYWd8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80"
        ],
        inStock: true,
        quantity: 12,
        featured: false,
        isNewArrival: true
      },
      {
        name: "Luxury Leather Messenger Bag",
        description: "Premium men's messenger bag crafted from full-grain leather with ample storage for daily essentials.",
        price: 155000,
        category: "bags",
        subcategory: "men",
        brand: "Premium Menswear",
        brandType: "Premium Menswear",
        images: [
          "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1527609965781-986a042f05af?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTZ8fG1lbnMlMjBsZWF0aGVyJTIwYmFnfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fG1lbnMlMjBsZWF0aGVyJTIwYmFnfGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1516559828984-fb3b99548b21?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OXx8bWVucyUyMGxlYXRoZXIlMjBiYWd8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1505236500572-0f4a274af7b8?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8bWVucyUyMGxlYXRoZXIlMjBiYWd8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Dark Brown", "Black", "Tan"],
        sizes: ["Standard"],
        rating: 4.8,
        reviewCount: 95,
        specifications: {
          material: "Full-grain leather",
          dimensions: "15 x 11 x 4 inches",
          pockets: "2 exterior, 4 interior including laptop sleeve",
          strap: "Adjustable shoulder strap with padded section"
        },
        material: "Premium full-grain leather with brass hardware",
        careInstructions: "Clean with a soft, dry cloth. Apply leather conditioner every 3-6 months.",
        inStock: true,
        quantity: 18,
        featured: true,
        isNewArrival: true
      },
      {
        name: "Swiss Automatic Chronograph Watch",
        description: "Premium men's automatic chronograph watch with Swiss movement and sapphire crystal.",
        price: 275000,
        discountPrice: 225000,
        discountPercentage: 18,
        discountEndDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
        category: "accessories",
        subcategory: "men",
        brand: "Precision Timepieces",
        brandType: "Precision Timepieces",
        images: [
          "https://images.unsplash.com/photo-1524592094714-0f0654e20314?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1509941943102-10c232535736?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8bWVucyUyMHdhdGNofGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8bWVucyUyMHdhdGNofGVufDB8fDB8fHww&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1547996160-81dfa63595aa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fG1lbnMlMjB3YXRjaHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1539874754764-5a96559165b0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTV8fG1lbnMlMjB3YXRjaHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Silver/Black", "Gold/Brown", "Rose Gold/Blue"],
        sizes: ["One Size"],
        rating: 4.9,
        reviewCount: 68,
        specifications: {
          movement: "Swiss automatic chronograph",
          case: "316L stainless steel, 42mm diameter",
          crystal: "Scratch-resistant sapphire with anti-reflective coating",
          waterResistance: "10 ATM (100 meters)",
          functions: "Hours, minutes, seconds, date, chronograph"
        },
        material: "316L stainless steel case, genuine leather strap",
        careInstructions: "Keep away from magnets. Service every 3-5 years. Clean with a soft, dry cloth.",
        inStock: true,
        quantity: 12,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Handcrafted Leather Wallet",
        description: "Premium slim bifold wallet crafted from full-grain leather with RFID protection.",
        price: 45000,
        category: "accessories",
        subcategory: "men",
        brand: "Urban Premium",
        brandType: "Urban Premium",
        images: [
          "https://images.unsplash.com/photo-1627123424574-724758594e93?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1572153577125-f819242b95df?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8bWVucyUyMHdhbGxldHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1582539160971-3973564ce6f5?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVucyUyMHdhbGxldHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1582539160902-3b8f3f3a6f1c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8bWVucyUyMHdhbGxldHxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=600&q=80",
          "https://images.unsplash.com/photo-1611078489935-0cb964de46d6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjB8fG1lbnMlMjB3YWxsZXR8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=600&q=80"
        ],
        colors: ["Brown", "Black", "Tan"],
        sizes: ["One Size"],
        rating: 4.7,
        reviewCount: 205,
        specifications: {
          material: "Full-grain leather",
          dimensions: "4.5 x 3.5 inches (closed)",
          capacity: "8 card slots, 2 cash compartments",
          features: "RFID blocking technology"
        },
        material: "Full-grain vegetable-tanned leather",
        careInstructions: "Wipe with a soft, dry cloth. Apply leather conditioner as needed.",
        inStock: true,
        quantity: 50,
        featured: false,
        isNewArrival: true
      }
    ];
    
    // Add women's clothing products
    const womensClothing: InsertProduct[] = [
      {
        name: "Silk Ruffle Blouse",
        description: "Elegant silk blouse with intricate ruffle details, perfect for both professional and evening settings. Made from 100% mulberry silk for a luxurious feel and appearance.",
        price: 24599,
        category: "women",
        subcategory: "clothing",
        brand: "Eleganza",
        brandType: "Luxury Brand",
        images: [
          "https://images.unsplash.com/photo-1615397349754-cfa2066a298e?q=80&w=1000",
          "https://images.unsplash.com/photo-1583846783214-7229a91b20ed?q=80&w=1000"
        ],
        colors: ["Ivory", "Black", "Burgundy"],
        sizes: ["XS", "S", "M", "L", "XL"],
        rating: 4.8,
        reviewCount: 58,
        material: "100% Silk",
        careInstructions: "Dry clean only",
        inStock: true,
        quantity: 42,
        featured: true,
        isNewArrival: true
      },
      {
        name: "Cashmere Turtleneck Sweater",
        description: "Luxuriously soft cashmere turtleneck sweater that provides exceptional warmth without bulk. Perfect for layering during cooler months.",
        price: 38900,
        category: "women",
        subcategory: "clothing",
        brand: "Milano",
        brandType: "Designer Collection",
        images: [
          "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=1000",
          "https://images.unsplash.com/photo-1608234807905-4466023792f5?q=80&w=1000"
        ],
        colors: ["Camel", "Charcoal", "Cream"],
        sizes: ["S", "M", "L", "XL"],
        rating: 4.9,
        reviewCount: 126,
        material: "100% Cashmere",
        careInstructions: "Hand wash cold or dry clean",
        inStock: true,
        quantity: 36,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Tailored Wool Trousers",
        description: "Impeccably tailored wool trousers with a contemporary straight leg cut. Features invisible side zip and elegant front pleats.",
        price: 32000,
        category: "women",
        subcategory: "clothing",
        brand: "Savile Row",
        brandType: "Premium Womenswear",
        images: [
          "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?q=80&w=1000",
          "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?q=80&w=1000"
        ],
        colors: ["Black", "Navy", "Grey"],
        sizes: ["0", "2", "4", "6", "8", "10", "12", "14"],
        rating: 4.7,
        reviewCount: 84,
        material: "95% Wool, 5% Elastane",
        careInstructions: "Dry clean only",
        inStock: true,
        quantity: 28,
        featured: false,
        isNewArrival: false
      },
      {
        name: "Pleated Maxi Skirt",
        description: "Elegant pleated maxi skirt crafted from flowing satin for a beautiful drape and movement. Features a comfortable elastic waistband and falls to ankle length.",
        price: 27500,
        discountPrice: 22000,
        discountPercentage: 20,
        category: "women",
        subcategory: "clothing",
        brand: "Parisian Chic",
        brandType: "Designer Collection",
        images: [
          "https://images.unsplash.com/photo-1573878415613-fe2a3f769de8?q=80&w=1000",
          "https://images.unsplash.com/photo-1551163943-3f7053a9fad8?q=80&w=1000"
        ],
        colors: ["Emerald", "Ruby", "Sapphire Blue"],
        sizes: ["XS", "S", "M", "L"],
        rating: 4.6,
        reviewCount: 42,
        material: "100% Satin Polyester",
        careInstructions: "Machine wash gentle cycle cold",
        inStock: true,
        quantity: 23,
        featured: false,
        isNewArrival: true
      },
      {
        name: "Structured Blazer Dress",
        description: "Sophisticated blazer dress with structured shoulders and a nipped waist. Double-breasted with gold buttons for a touch of glamour.",
        price: 49900,
        category: "women",
        subcategory: "clothing",
        brand: "Haute Couture",
        brandType: "Luxury Brand",
        images: [
          "https://images.unsplash.com/photo-1548778943-5bbeeb1ba6c1?q=80&w=1000",
          "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?q=80&w=1000"
        ],
        colors: ["Black", "White", "Red"],
        sizes: ["XS", "S", "M", "L", "XL"],
        rating: 4.9,
        reviewCount: 64,
        material: "96% Polyester, 4% Elastane",
        careInstructions: "Dry clean only",
        inStock: true,
        quantity: 18,
        featured: true,
        isNewArrival: true
      }
    ];

    // Women's Bags Products
    const womensBags: InsertProduct[] = [
      {
        name: "Quilted Leather Crossbody",
        description: "Timeless quilted leather crossbody bag with adjustable chain strap and signature twist lock closure. Crafted from buttery soft lambskin.",
        price: 195000,
        category: "women",
        subcategory: "bags",
        brand: "Maison Luxe",
        brandType: "Luxury Brand",
        images: [
          "https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=1000",
          "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?q=80&w=1000"
        ],
        colors: ["Black", "Beige", "Red"],
        sizes: ["One Size"],
        rating: 4.8,
        reviewCount: 189,
        material: "100% Lambskin Leather",
        careInstructions: "Wipe with soft cloth",
        inStock: true,
        quantity: 15,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Structured Top Handle Bag",
        description: "Elegant structured top handle bag with removable shoulder strap. Features gold-tone hardware and a spacious interior with multiple compartments.",
        price: 175000,
        category: "women",
        subcategory: "bags",
        brand: "Milano",
        brandType: "Designer Collection",
        images: [
          "https://images.unsplash.com/photo-1591561954555-607968c989ab?q=80&w=1000",
          "https://images.unsplash.com/photo-1614179689702-66d0fef4da19?q=80&w=1000"
        ],
        colors: ["Cognac", "Black", "Navy"],
        sizes: ["One Size"],
        rating: 4.7,
        reviewCount: 143,
        material: "Premium Calfskin",
        careInstructions: "Store in dust bag when not in use",
        inStock: true,
        quantity: 12,
        featured: true,
        isNewArrival: true
      },
      {
        name: "Woven Raffia Tote",
        description: "Artisanal woven raffia tote with leather handles and trim. Perfect blend of casual elegance for summer days.",
        price: 89000,
        discountPrice: 71200,
        discountPercentage: 20,
        category: "women",
        subcategory: "bags",
        brand: "Coastal Luxe",
        brandType: "Designer Collection",
        images: [
          "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?q=80&w=1000",
          "https://images.unsplash.com/photo-1605733513597-a8f8341084e6?q=80&w=1000"
        ],
        colors: ["Natural", "Black/Natural"],
        sizes: ["One Size"],
        rating: 4.5,
        reviewCount: 87,
        material: "Raffia, Calfskin Leather",
        careInstructions: "Avoid exposure to water",
        inStock: true,
        quantity: 18,
        featured: false,
        isNewArrival: true
      },
      {
        name: "Suede Bucket Bag",
        description: "Luxurious suede bucket bag with drawstring closure and removable leather crossbody strap. Lined with soft microsuede.",
        price: 129000,
        category: "women",
        subcategory: "bags",
        brand: "Parisian Chic",
        brandType: "Luxury Brand",
        images: [
          "https://images.unsplash.com/photo-1596149615493-f0739de31c2d?q=80&w=1000",
          "https://images.unsplash.com/photo-1619627826693-8f0b1cf85b14?q=80&w=1000"
        ],
        colors: ["Taupe", "Black", "Burgundy"],
        sizes: ["One Size"],
        rating: 4.6,
        reviewCount: 76,
        material: "100% Suede, Leather trim",
        careInstructions: "Professional leather cleaning only",
        inStock: true,
        quantity: 10,
        featured: false,
        isNewArrival: false
      },
      {
        name: "Embellished Evening Clutch",
        description: "Exquisite evening clutch featuring hand-applied crystal embellishments. Includes a delicate chain strap that can be tucked inside.",
        price: 245000,
        category: "women",
        subcategory: "bags",
        brand: "Haute Couture",
        brandType: "Luxury Brand",
        images: [
          "https://images.unsplash.com/photo-1566150902887-9679ecc155ba?q=80&w=1000",
          "https://images.unsplash.com/photo-1575821539030-043877ab6e68?q=80&w=1000"
        ],
        colors: ["Silver", "Gold", "Black"],
        sizes: ["One Size"],
        rating: 4.9,
        reviewCount: 52,
        material: "Satin, Crystal embellishments",
        careInstructions: "Handle with care, store in box",
        inStock: true,
        quantity: 8,
        featured: true,
        isNewArrival: true
      }
    ];

    // Women's Jewelry Products
    const womensJewelry: InsertProduct[] = [
      {
        name: "Diamond Tennis Bracelet",
        description: "Timeless diamond tennis bracelet featuring 5 carats of round brilliant diamonds set in 18K white gold. A true investment piece.",
        price: 1250000,
        category: "women",
        subcategory: "jewelry",
        brand: "Diamond Maison",
        brandType: "Fine Jewelry",
        images: [
          "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=1000",
          "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1000"
        ],
        colors: ["White Gold"],
        sizes: ["7 inches", "7.5 inches"],
        rating: 4.9,
        reviewCount: 34,
        material: "18K White Gold, Diamonds",
        careInstructions: "Professional jewelry cleaning recommended",
        inStock: true,
        quantity: 5,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Pearl Drop Earrings",
        description: "Elegant pearl drop earrings featuring South Sea pearls suspended from diamond-encrusted 18K gold posts.",
        price: 485000,
        category: "women",
        subcategory: "jewelry",
        brand: "Oceanic Gems",
        brandType: "Fine Jewelry",
        images: [
          "https://images.unsplash.com/photo-1588444837495-c6cfeb53f32d?q=80&w=1000",
          "https://images.unsplash.com/photo-1630019852942-7a3660aa7fb2?q=80&w=1000"
        ],
        colors: ["Gold/White Pearl"],
        sizes: ["One Size"],
        rating: 4.8,
        reviewCount: 46,
        material: "18K Gold, South Sea Pearls, Diamonds",
        careInstructions: "Store separately, avoid contact with perfumes",
        inStock: true,
        quantity: 8,
        featured: true,
        isNewArrival: true
      },
      {
        name: "Emerald Statement Ring",
        description: "Breathtaking statement ring featuring a 3-carat Colombian emerald surrounded by a halo of diamonds set in platinum.",
        price: 1890000,
        category: "women",
        subcategory: "jewelry",
        brand: "Royal Gems",
        brandType: "Fine Jewelry",
        images: [
          "https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=80&w=1000",
          "https://images.unsplash.com/photo-1603974372039-adc49044b6bd?q=80&w=1000"
        ],
        colors: ["Platinum/Emerald"],
        sizes: ["5", "5.5", "6", "6.5", "7", "7.5"],
        rating: 4.9,
        reviewCount: 21,
        material: "Platinum, Emerald, Diamonds",
        careInstructions: "Professional cleaning only, avoid impact",
        inStock: true,
        quantity: 3,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Gold Chain Necklace",
        description: "Versatile 18K gold chain necklace featuring an adjustable length and lobster clasp closure. A modern everyday essential.",
        price: 325000,
        discountPrice: 276250,
        discountPercentage: 15,
        category: "women",
        subcategory: "jewelry",
        brand: "Milano",
        brandType: "Designer Collection",
        images: [
          "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1000",
          "https://images.unsplash.com/photo-1635767798638-3e25273a8236?q=80&w=1000"
        ],
        colors: ["Gold"],
        sizes: ["16-18 inches adjustable"],
        rating: 4.7,
        reviewCount: 82,
        material: "18K Gold",
        careInstructions: "Polish with soft jewelry cloth",
        inStock: true,
        quantity: 12,
        featured: false,
        isNewArrival: true
      },
      {
        name: "Diamond Stud Earrings",
        description: "Classic diamond stud earrings featuring a total of 2 carats of round brilliant diamonds set in platinum four-prong settings.",
        price: 895000,
        category: "women",
        subcategory: "jewelry",
        brand: "Diamond Maison",
        brandType: "Fine Jewelry",
        images: [
          "https://images.unsplash.com/photo-1589207212797-cfd06489ad76?q=80&w=1000",
          "https://images.unsplash.com/photo-1626784215021-2e39ccf972ae?q=80&w=1000"
        ],
        colors: ["Platinum"],
        sizes: ["One Size"],
        rating: 4.9,
        reviewCount: 118,
        material: "Platinum, Diamonds",
        careInstructions: "Professional cleaning recommended",
        inStock: true,
        quantity: 6,
        featured: true,
        isNewArrival: false
      }
    ];

    // Women's Accessories Products
    const womensAccessories: InsertProduct[] = [
      {
        name: "Silk Twill Scarf",
        description: "Luxurious silk twill scarf featuring a signature equestrian print in vibrant colors. Hand-rolled edges for a refined finish.",
        price: 45000,
        category: "women",
        subcategory: "accessories",
        brand: "Parisian Chic",
        brandType: "Luxury Brand",
        images: [
          "https://images.unsplash.com/photo-1583534069808-ca13a28a6b25?q=80&w=1000",
          "https://images.unsplash.com/photo-1602522797324-5c9e5f7ff9c0?q=80&w=1000"
        ],
        colors: ["Multicolor Blue", "Multicolor Red", "Multicolor Green"],
        sizes: ["36\" x 36\""],
        rating: 4.8,
        reviewCount: 143,
        material: "100% Silk Twill",
        careInstructions: "Dry clean only",
        inStock: true,
        quantity: 25,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Leather Gloves",
        description: "Exquisite leather gloves crafted from supple lambskin and lined with cashmere for exceptional warmth and comfort.",
        price: 32500,
        category: "women",
        subcategory: "accessories",
        brand: "Milano",
        brandType: "Designer Collection",
        images: [
          "https://images.unsplash.com/photo-1607611439230-fcbf50e42f4c?q=80&w=1000",
          "https://images.unsplash.com/photo-1594223274512-ad4200e99e81?q=80&w=1000"
        ],
        colors: ["Black", "Brown", "Burgundy"],
        sizes: ["6.5", "7", "7.5", "8"],
        rating: 4.7,
        reviewCount: 86,
        material: "Lambskin Leather, Cashmere Lining",
        careInstructions: "Professional leather cleaning only",
        inStock: true,
        quantity: 18,
        featured: false,
        isNewArrival: true
      },
      {
        name: "Oversized Sunglasses",
        description: "Statement oversized sunglasses with gradient lenses and acetate frames. Offers 100% UV protection.",
        price: 37500,
        discountPrice: 30000,
        discountPercentage: 20,
        category: "women",
        subcategory: "accessories",
        brand: "Eyewear Luxe",
        brandType: "Designer Collection",
        images: [
          "https://images.unsplash.com/photo-1577803645773-f96470509666?q=80&w=1000",
          "https://images.unsplash.com/photo-1602699985953-5d0ef0dfbdb7?q=80&w=1000"
        ],
        colors: ["Tortoise", "Black", "Havana"],
        sizes: ["One Size"],
        rating: 4.6,
        reviewCount: 107,
        material: "Acetate, Gradient CR-39 Lenses",
        careInstructions: "Clean with microfiber cloth, store in case",
        inStock: true,
        quantity: 22,
        featured: true,
        isNewArrival: false
      },
      {
        name: "Wide-Brim Straw Hat",
        description: "Elegantly crafted wide-brim straw hat with grosgrain ribbon trim. Perfect for sun protection with timeless style.",
        price: 39500,
        category: "women",
        subcategory: "accessories",
        brand: "Riviera Style",
        brandType: "Designer Collection",
        images: [
          "https://images.unsplash.com/photo-1572307480813-ceb0e59d8325?q=80&w=1000",
          "https://images.unsplash.com/photo-1553591465-aa3a1ff902be?q=80&w=1000"
        ],
        colors: ["Natural", "Black/Natural"],
        sizes: ["S/M", "M/L"],
        rating: 4.5,
        reviewCount: 54,
        material: "Woven Straw, Grosgrain Ribbon",
        careInstructions: "Spot clean only, store in hat box",
        inStock: true,
        quantity: 15,
        featured: false,
        isNewArrival: true
      },
      {
        name: "Leather Belt with Gold Buckle",
        description: "Luxurious leather belt featuring a signature gold-tone buckle. Handcrafted from the finest calfskin leather.",
        price: 49500,
        category: "women",
        subcategory: "accessories",
        brand: "Maison Luxe",
        brandType: "Luxury Brand",
        images: [
          "https://images.unsplash.com/photo-1511453606184-2c29b238ffc3?q=80&w=1000",
          "https://images.unsplash.com/photo-1624378439575-d8705ad01dce?q=80&w=1000"
        ],
        colors: ["Black", "Tan", "White"],
        sizes: ["70cm", "75cm", "80cm", "85cm", "90cm"],
        rating: 4.7,
        reviewCount: 68,
        material: "Calfskin Leather, Metal Hardware",
        careInstructions: "Wipe with soft cloth",
        inStock: true,
        quantity: 20,
        featured: true,
        isNewArrival: false
      }
    ];

    // Add all women's products to the product data
    productData.push(...womensClothing, ...womensBags, ...womensJewelry, ...womensAccessories);
    
    productData.forEach(product => this.createProduct(product));
  }

  // Visitor tracking properties
  private visitorStats: Map<string, VisitorStats>;
  private visitorSessions: Map<string, VisitorSession>;
  private activeVisitors: Map<string, ActiveVisitor>;

  // Visitor tracking methods
  async trackPageVisit(pageUrl: string, sessionId: string, userId?: number): Promise<void> {
    // Get today's date without time component
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateKey = today.toISOString().split('T')[0];
    
    // Get or create today's stats
    let todayStats = this.visitorStats.get(dateKey);
    if (!todayStats) {
      todayStats = {
        id: 0, // Will be set properly when actually saved to database
        date: today,
        pageVisits: {},
        totalVisits: 0,
        uniqueVisitors: 0,
        newVisitors: 0,
        returningVisitors: 0,
        visitSources: {},
        browsers: {},
        devices: {},
        countries: {},
        convertedVisitors: 0,
        conversionRate: 0,
        averageTimeOnSite: 0,
        bounceRate: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    // Increment page visit count
    const pageVisits = { ...todayStats.pageVisits };
    pageVisits[pageUrl] = (pageVisits[pageUrl] || 0) + 1;
    
    // Update stats
    todayStats = {
      ...todayStats,
      pageVisits,
      totalVisits: todayStats.totalVisits + 1,
      updatedAt: new Date()
    };
    
    // Save updated stats
    this.visitorStats.set(dateKey, todayStats);
    
    // Update session data if exists
    const session = this.visitorSessions.get(sessionId);
    if (session) {
      this.visitorSessions.set(sessionId, {
        ...session,
        pagesViewed: session.pagesViewed + 1,
        updatedAt: new Date()
      });
    }
    
    // Update active visitor data
    const existingVisitor = this.activeVisitors.get(sessionId);
    if (existingVisitor) {
      this.activeVisitors.set(sessionId, {
        ...existingVisitor,
        currentPage: pageUrl,
        lastActivityTime: new Date(),
        userId: userId || existingVisitor.userId
      });
    }
  }
  
  async recordVisitorSession(sessionData: InsertVisitorSession): Promise<VisitorSession> {
    // Generate a unique ID if one doesn't exist
    if (!sessionData.sessionId) {
      sessionData.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    
    const session: VisitorSession = {
      id: this.visitorSessions.size + 1,
      sessionId: sessionData.sessionId,
      userId: sessionData.userId || null,
      startTime: sessionData.startTime || new Date(),
      endTime: sessionData.endTime || null,
      duration: sessionData.duration || null,
      ipAddress: sessionData.ipAddress || null,
      userAgent: sessionData.userAgent || null,
      browser: sessionData.browser || null,
      device: sessionData.device || null,
      os: sessionData.os || null,
      country: sessionData.country || null,
      referrer: sessionData.referrer || null,
      landingPage: sessionData.landingPage,
      exitPage: sessionData.exitPage || null,
      pagesViewed: sessionData.pagesViewed || 1,
      isConverted: sessionData.isConverted || false,
      conversionValue: sessionData.conversionValue || null,
      deviceId: sessionData.deviceId || null,
      visitCount: sessionData.visitCount || 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.visitorSessions.set(session.sessionId, session);
    
    // Also track as active visitor
    await this.trackActiveVisitor({
      sessionId: session.sessionId,
      userId: session.userId,
      currentPage: session.landingPage,
      deviceId: session.deviceId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActivityTime: new Date()
    });
    
    // Update daily stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateKey = today.toISOString().split('T')[0];
    
    let todayStats = this.visitorStats.get(dateKey);
    if (!todayStats) {
      todayStats = {
        id: 0,
        date: today,
        pageVisits: {},
        totalVisits: 0,
        uniqueVisitors: 0,
        newVisitors: 0,
        returningVisitors: 0,
        visitSources: {},
        browsers: {},
        devices: {},
        countries: {},
        convertedVisitors: 0,
        conversionRate: 0,
        averageTimeOnSite: 0,
        bounceRate: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    // Update unique visitors count
    todayStats.uniqueVisitors++;
    
    // If visit count is 1, it's a new visitor
    if (session.visitCount === 1) {
      todayStats.newVisitors++;
    } else {
      todayStats.returningVisitors++;
    }
    
    // Update browser stats if available
    if (session.browser) {
      const browsers = { ...todayStats.browsers };
      browsers[session.browser] = (browsers[session.browser] || 0) + 1;
      todayStats.browsers = browsers;
    }
    
    // Update device stats if available
    if (session.device) {
      const devices = { ...todayStats.devices };
      devices[session.device] = (devices[session.device] || 0) + 1;
      todayStats.devices = devices;
    }
    
    // Update country stats if available
    if (session.country) {
      const countries = { ...todayStats.countries };
      countries[session.country] = (countries[session.country] || 0) + 1;
      todayStats.countries = countries;
    }
    
    // Update referrer stats if available
    if (session.referrer) {
      const visitSources = { ...todayStats.visitSources };
      visitSources[session.referrer] = (visitSources[session.referrer] || 0) + 1;
      todayStats.visitSources = visitSources;
    }
    
    // Save updated stats
    this.visitorStats.set(dateKey, todayStats);
    
    return session;
  }
  
  async updateVisitorSession(sessionId: string, updateData: Partial<VisitorSession>): Promise<VisitorSession | undefined> {
    const session = this.visitorSessions.get(sessionId);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updateData, updatedAt: new Date() };
    
    // Calculate duration if endTime is provided
    if (updateData.endTime && !updateData.duration) {
      const startTime = session.startTime.getTime();
      const endTime = updateData.endTime.getTime();
      updatedSession.duration = Math.floor((endTime - startTime) / 1000); // in seconds
    }
    
    this.visitorSessions.set(sessionId, updatedSession);
    
    // If converted, update daily stats
    if (updateData.isConverted && !session.isConverted) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dateKey = today.toISOString().split('T')[0];
      
      const todayStats = this.visitorStats.get(dateKey);
      if (todayStats) {
        const updatedStats = {
          ...todayStats,
          convertedVisitors: todayStats.convertedVisitors + 1,
          conversionRate: (todayStats.convertedVisitors + 1) / todayStats.uniqueVisitors * 100,
          updatedAt: new Date()
        };
        this.visitorStats.set(dateKey, updatedStats);
      }
    }
    
    return updatedSession;
  }
  
  async trackActiveVisitor(visitorData: InsertActiveVisitor): Promise<ActiveVisitor> {
    const visitor: ActiveVisitor = {
      id: this.activeVisitors.size + 1,
      sessionId: visitorData.sessionId,
      userId: visitorData.userId || null,
      currentPage: visitorData.currentPage,
      lastActivityTime: visitorData.lastActivityTime || new Date(),
      deviceId: visitorData.deviceId || null,
      ipAddress: visitorData.ipAddress || null,
      userAgent: visitorData.userAgent || null
    };
    
    this.activeVisitors.set(visitor.sessionId, visitor);
    return visitor;
  }
  
  async updateActiveVisitor(sessionId: string, updateData: Partial<ActiveVisitor>): Promise<ActiveVisitor | undefined> {
    const visitor = this.activeVisitors.get(sessionId);
    if (!visitor) return undefined;
    
    const updatedVisitor = { ...visitor, ...updateData };
    this.activeVisitors.set(sessionId, updatedVisitor);
    return updatedVisitor;
  }
  
  async removeActiveVisitor(sessionId: string): Promise<boolean> {
    return this.activeVisitors.delete(sessionId);
  }
  
  async getActiveVisitorsCount(): Promise<number> {
    // Count active visitors within the last 5 minutes
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    
    let count = 0;
    for (const visitor of this.activeVisitors.values()) {
      if (visitor.lastActivityTime > cutoffTime) {
        count++;
      } else {
        // Remove inactive visitors
        this.activeVisitors.delete(visitor.sessionId);
      }
    }
    
    return count;
  }
  
  async getActiveVisitorsByPage(): Promise<Record<string, number>> {
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const pageVisits: Record<string, number> = {};
    
    for (const visitor of this.activeVisitors.values()) {
      if (visitor.lastActivityTime > cutoffTime) {
        pageVisits[visitor.currentPage] = (pageVisits[visitor.currentPage] || 0) + 1;
      } else {
        // Remove inactive visitors
        this.activeVisitors.delete(visitor.sessionId);
      }
    }
    
    return pageVisits;
  }
  
  async getDailyVisitorStats(date: Date): Promise<VisitorStats | undefined> {
    const dateKey = date.toISOString().split('T')[0];
    return this.visitorStats.get(dateKey);
  }
  
  async updateDailyVisitorStats(date: Date, updateData: Partial<VisitorStats>): Promise<VisitorStats | undefined> {
    const dateKey = date.toISOString().split('T')[0];
    const stats = this.visitorStats.get(dateKey);
    if (!stats) return undefined;
    
    const updatedStats = { ...stats, ...updateData, updatedAt: new Date() };
    this.visitorStats.set(dateKey, updatedStats);
    return updatedStats;
  }
  
  async getVisitorStatsByDateRange(startDate: Date, endDate: Date): Promise<VisitorStats[]> {
    const result: VisitorStats[] = [];
    
    for (const stats of this.visitorStats.values()) {
      const statsDate = new Date(stats.date);
      if (statsDate >= startDate && statsDate <= endDate) {
        result.push(stats);
      }
    }
    
    // Sort by date
    return result.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  
  // User addresses methods
  async getUserAddresses(userId: number): Promise<UserAddress[]> {
    return Array.from(this.userAddresses.values()).filter(address => address.userId === userId);
  }
  
  async getUserAddress(id: number): Promise<UserAddress | undefined> {
    return this.userAddresses.get(id);
  }
  
  async createUserAddress(addressData: InsertUserAddress): Promise<UserAddress> {
    // If this is the first address or marked as default, reset other default addresses
    if (addressData.isDefault || Array.from(this.userAddresses.values()).filter(a => a.userId === addressData.userId).length === 0) {
      Array.from(this.userAddresses.values()).forEach(address => {
        if (address.userId === addressData.userId) {
          address.isDefault = false;
          this.userAddresses.set(address.id, address);
        }
      });
      addressData.isDefault = true;
    }
    
    const id = this.currentUserAddressId++;
    const now = new Date();
    const newAddress: UserAddress = { 
      id, 
      ...addressData,
      createdAt: now,
      updatedAt: now
    };
    
    this.userAddresses.set(id, newAddress);
    return newAddress;
  }
  
  async updateUserAddress(id: number, addressData: Partial<InsertUserAddress>): Promise<UserAddress | undefined> {
    const address = this.userAddresses.get(id);
    if (!address) return undefined;
    
    // If updating to default, reset other default addresses
    if (addressData.isDefault) {
      Array.from(this.userAddresses.values()).forEach(a => {
        if (a.userId === address.userId && a.id !== id) {
          a.isDefault = false;
          this.userAddresses.set(a.id, a);
        }
      });
    }
    
    const updatedAddress = {
      ...address,
      ...addressData,
      updatedAt: new Date()
    };
    
    this.userAddresses.set(id, updatedAddress);
    return updatedAddress;
  }
  
  async deleteUserAddress(id: number): Promise<boolean> {
    const addressToDelete = this.userAddresses.get(id);
    if (!addressToDelete) return false;
    
    const deleted = this.userAddresses.delete(id);
    
    // If deleted address was default, make another address default
    if (deleted && addressToDelete.isDefault) {
      const userAddresses = Array.from(this.userAddresses.values())
        .filter(a => a.userId === addressToDelete.userId);
      
      if (userAddresses.length > 0) {
        userAddresses[0].isDefault = true;
        this.userAddresses.set(userAddresses[0].id, userAddresses[0]);
      }
    }
    
    return deleted;
  }
  
  // Payment methods methods
  async getUserPaymentMethods(userId: number): Promise<UserPaymentMethod[]> {
    return Array.from(this.userPaymentMethods.values()).filter(method => method.userId === userId);
  }
  
  async getUserPaymentMethod(id: number): Promise<UserPaymentMethod | undefined> {
    return this.userPaymentMethods.get(id);
  }
  
  async createUserPaymentMethod(paymentData: InsertUserPaymentMethod): Promise<UserPaymentMethod> {
    // If this is the first payment method or marked as default, reset other default methods
    if (paymentData.isDefault || Array.from(this.userPaymentMethods.values()).filter(p => p.userId === paymentData.userId).length === 0) {
      Array.from(this.userPaymentMethods.values()).forEach(method => {
        if (method.userId === paymentData.userId) {
          method.isDefault = false;
          this.userPaymentMethods.set(method.id, method);
        }
      });
      paymentData.isDefault = true;
    }
    
    const id = this.currentUserPaymentMethodId++;
    const now = new Date();
    const newPaymentMethod: UserPaymentMethod = { 
      id, 
      ...paymentData,
      createdAt: now,
      updatedAt: now
    };
    
    this.userPaymentMethods.set(id, newPaymentMethod);
    return newPaymentMethod;
  }
  
  async updateUserPaymentMethod(id: number, paymentData: Partial<InsertUserPaymentMethod>): Promise<UserPaymentMethod | undefined> {
    const method = this.userPaymentMethods.get(id);
    if (!method) return undefined;
    
    // If updating to default, reset other default payment methods
    if (paymentData.isDefault) {
      Array.from(this.userPaymentMethods.values()).forEach(m => {
        if (m.userId === method.userId && m.id !== id) {
          m.isDefault = false;
          this.userPaymentMethods.set(m.id, m);
        }
      });
    }
    
    const updatedMethod = {
      ...method,
      ...paymentData,
      updatedAt: new Date()
    };
    
    this.userPaymentMethods.set(id, updatedMethod);
    return updatedMethod;
  }
  
  async deleteUserPaymentMethod(id: number): Promise<boolean> {
    const methodToDelete = this.userPaymentMethods.get(id);
    if (!methodToDelete) return false;
    
    const deleted = this.userPaymentMethods.delete(id);
    
    // If deleted method was default, make another method default
    if (deleted && methodToDelete.isDefault) {
      const userMethods = Array.from(this.userPaymentMethods.values())
        .filter(m => m.userId === methodToDelete.userId);
      
      if (userMethods.length > 0) {
        userMethods[0].isDefault = true;
        this.userPaymentMethods.set(userMethods[0].id, userMethods[0]);
      }
    }
    
    return deleted;
  }
  
  // User notifications methods
  async getUserNotifications(userId: number): Promise<UserNotification[]> {
    return Array.from(this.userNotifications.values())
      .filter(notification => notification.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Sort newest first
  }
  
  async getUnreadNotificationCount(userId: number): Promise<number> {
    return Array.from(this.userNotifications.values())
      .filter(notification => notification.userId === userId && !notification.isRead)
      .length;
  }
  
  async createUserNotification(notificationData: InsertUserNotification): Promise<UserNotification> {
    const id = this.currentUserNotificationId++;
    const newNotification: UserNotification = { 
      id, 
      ...notificationData,
      createdAt: new Date()
    };
    
    this.userNotifications.set(id, newNotification);
    return newNotification;
  }
  
  async markNotificationAsRead(id: number): Promise<UserNotification | undefined> {
    const notification = this.userNotifications.get(id);
    if (!notification) return undefined;
    
    notification.isRead = true;
    this.userNotifications.set(id, notification);
    
    return notification;
  }
  
  async markAllNotificationsAsRead(userId: number): Promise<number> {
    let count = 0;
    
    Array.from(this.userNotifications.values()).forEach(notification => {
      if (notification.userId === userId && !notification.isRead) {
        notification.isRead = true;
        this.userNotifications.set(notification.id, notification);
        count++;
      }
    });
    
    return count;
  }
  
  async deleteUserNotification(id: number): Promise<boolean> {
    return this.userNotifications.delete(id);
  }
  
  // User settings methods
  async getUserSettings(userId: number): Promise<UserSetting | undefined> {
    return Array.from(this.userSettings.values()).find(settings => settings.userId === userId);
  }
  
  async createOrUpdateUserSettings(userId: number, settingsData: Partial<InsertUserSetting>): Promise<UserSetting> {
    const existingSettings = Array.from(this.userSettings.values()).find(settings => settings.userId === userId);
    
    if (existingSettings) {
      // Update existing settings
      const updatedSettings = {
        ...existingSettings,
        ...settingsData,
        updatedAt: new Date()
      };
      
      this.userSettings.set(existingSettings.id, updatedSettings);
      return updatedSettings;
    } else {
      // Create new settings
      const now = new Date();
      const newSettings: UserSetting = {
        id: this.currentUserSettingId++,
        userId,
        emailNotifications: settingsData.emailNotifications ?? true,
        smsNotifications: settingsData.smsNotifications ?? false,
        appNotifications: settingsData.appNotifications ?? true,
        marketingEmails: settingsData.marketingEmails ?? true,
        orderUpdates: settingsData.orderUpdates ?? true,
        promotionAlerts: settingsData.promotionAlerts ?? true,
        theme: settingsData.theme ?? 'system',
        language: settingsData.language ?? 'en',
        createdAt: now,
        updatedAt: now
      };
      
      this.userSettings.set(newSettings.id, newSettings);
      return newSettings;
    }
  }
}

export const storage = new MemStorage();

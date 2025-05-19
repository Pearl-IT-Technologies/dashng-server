import mongoose, { Schema, Document } from 'mongoose';

export enum NotificationType {
  ORDER_PLACED = 'order_placed',
  ORDER_UPDATED = 'order_updated',
  PAYMENT_RECEIVED = 'payment_received',
  LOW_STOCK = 'low_stock',
  STOCK_UPDATE = 'stock_update',
  PRODUCT_REVIEW = 'product_review',
  SYSTEM = 'system'
}

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  data?: any;
  createdAt: Date;
  expiresAt?: Date;
}

const NotificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
      type: Schema.Types.Mixed
    },
    expiresAt: {
      type: Date
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

// Create indexes for improved performance
NotificationSchema.index({ user: 1 });
NotificationSchema.index({ read: 1 });
NotificationSchema.index({ type: 1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
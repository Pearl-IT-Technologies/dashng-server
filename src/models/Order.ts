import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from './User.js';
import { IProduct } from './Product.js';

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_PAID = 'partially_paid'
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  PAYPAL = 'paypal',
  BANK_TRANSFER = 'bank_transfer',
  CASH_ON_DELIVERY = 'cash_on_delivery',
  PAYSTACK = 'paystack',
  FLUTTERWAVE = 'flutterwave',
  STRIPE = 'stripe'
}

export interface OrderItem {
  product: IProduct['_id'];
  quantity: number;
  price: number;
  name: string;
  productDetails?: {
    image?: string;
    category?: string;
  };
}

export interface ShippingInfo {
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
}

export interface PaymentInfo {
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  amount: number;
  currency: string;
  gateway?: string;
  partialPayments?: {
    amount: number;
    date: Date;
    reference: string;
    gateway: string;
  }[];
}

export interface IOrder extends Document {
  user: IUser['_id'];
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  shippingInfo: ShippingInfo;
  paymentInfo: PaymentInfo;
  trackingNumber?: string;
  notes?: string;
  createdBy?: IUser['_id'];
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    items: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        quantity: {
          type: Number,
          required: true,
          min: 1
        },
        price: {
          type: Number,
          required: true,
          min: 0
        },
        name: {
          type: String,
          required: true
        },
        productDetails: {
          image: String,
          category: String
        }
      }
    ],
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING
    },
    shippingInfo: {
      address: {
        type: String,
        required: true
      },
      city: {
        type: String,
        required: true
      },
      state: {
        type: String,
        required: true
      },
      country: {
        type: String,
        required: true
      },
      postalCode: {
        type: String,
        required: true
      },
      phone: {
        type: String,
        required: true
      }
    },
    paymentInfo: {
      method: {
        type: String,
        enum: Object.values(PaymentMethod),
        required: true
      },
      status: {
        type: String,
        enum: Object.values(PaymentStatus),
        default: PaymentStatus.PENDING
      },
      transactionId: String,
      amount: {
        type: Number,
        required: true
      },
      currency: {
        type: String,
        default: 'NGN'
      },
      gateway: String,
      partialPayments: [
        {
          amount: Number,
          date: Date,
          reference: String,
          gateway: String
        }
      ]
    },
    trackingNumber: String,
    notes: String,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for improved performance
OrderSchema.index({ user: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ 'paymentInfo.status': 1 });
OrderSchema.index({ 'paymentInfo.transactionId': 1 });
OrderSchema.index({ trackingNumber: 1 });

export default mongoose.model<IOrder>('Order', OrderSchema);
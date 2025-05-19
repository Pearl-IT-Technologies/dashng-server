import mongoose, { Schema, Document } from 'mongoose';
import { PaymentMethod, PaymentStatus } from './Order';

export interface IPayment extends Document {
  order: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  gateway: string;
  gatewayResponse?: any;
  receiptUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'NGN',
      required: true
    },
    method: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: true
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      required: true
    },
    reference: {
      type: String,
      required: true,
      unique: true
    },
    gateway: {
      type: String,
      required: true
    },
    gatewayResponse: {
      type: Schema.Types.Mixed
    },
    receiptUrl: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for improved performance
PaymentSchema.index({ order: 1 });
PaymentSchema.index({ user: 1 });
PaymentSchema.index({ reference: 1 }, { unique: true });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ createdAt: -1 });

export default mongoose.model<IPayment>('Payment', PaymentSchema);
import mongoose, { Schema, Document } from 'mongoose';

export enum InventoryActionType {
  STOCK_ADDED = 'stock_added',
  STOCK_REMOVED = 'stock_removed',
  STOCK_ADJUSTED = 'stock_adjusted',
  LOW_STOCK_ALERT = 'low_stock_alert',
  PRODUCT_CREATED = 'product_created',
  PRODUCT_UPDATED = 'product_updated'
}

export interface IInventoryHistory extends Document {
  product: mongoose.Types.ObjectId;
  actionType: InventoryActionType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  performedBy: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
}

const InventoryHistorySchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
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
      type: Schema.Types.ObjectId,
      ref: 'User',
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

// Create indexes for improved performance
InventoryHistorySchema.index({ product: 1 });
InventoryHistorySchema.index({ actionType: 1 });
InventoryHistorySchema.index({ performedBy: 1 });
InventoryHistorySchema.index({ createdAt: -1 });

export default mongoose.model<IInventoryHistory>('InventoryHistory', InventoryHistorySchema);
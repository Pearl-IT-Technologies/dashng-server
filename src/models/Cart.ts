import mongoose, { Schema, Document } from 'mongoose';

export interface CartItem {
  product: mongoose.Types.ObjectId;
  quantity: number;
  price: number;
  name: string;
  image?: string;
}

export interface ICart extends Document {
  user: mongoose.Types.ObjectId;
  items: CartItem[];
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
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
        image: {
          type: String
        }
      }
    ],
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

// Create index for improved performance
CartSchema.index({ user: 1 });

export default mongoose.model<ICart>('Cart', CartSchema);
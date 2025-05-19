import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  tags: string[];
  quantity: number;
  lowStockThreshold: number;
  featured: boolean;
  discount?: number;
  ratings?: {
    average: number;
    count: number;
  };
  specifications?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema(
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

// Create indexes for improved search performance
ProductSchema.index({ name: 'text', description: 'text', category: 'text', tags: 'text' });
ProductSchema.index({ price: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ quantity: 1 });
ProductSchema.index({ featured: 1 });

export default mongoose.model<IProduct>('Product', ProductSchema);
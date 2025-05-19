import mongoose, { Schema, Document } from 'mongoose';

export interface IReview extends Document {
  user: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  rating: number;
  title: string;
  comment: string;
  images?: string[];
  verified: boolean;
  helpful: number;
  reported: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    comment: {
      type: String,
      required: true
    },
    images: {
      type: [String],
      default: []
    },
    verified: {
      type: Boolean,
      default: false
    },
    helpful: {
      type: Number,
      default: 0
    },
    reported: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Create compound index to ensure a user can only review a product once
ReviewSchema.index({ user: 1, product: 1 }, { unique: true });
ReviewSchema.index({ product: 1 });
ReviewSchema.index({ rating: -1 });
ReviewSchema.index({ helpful: -1 });

export default mongoose.model<IReview>('Review', ReviewSchema);
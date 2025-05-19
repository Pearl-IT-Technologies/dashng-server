import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: mongoose.Types.ObjectId;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    description: {
      type: String
    },
    image: {
      type: String
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: 'Category'
    },
    featured: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for improved performance
CategorySchema.index({ slug: 1 });
CategorySchema.index({ name: 'text' });
CategorySchema.index({ parent: 1 });
CategorySchema.index({ featured: 1 });

export default mongoose.model<ICategory>('Category', CategorySchema);
import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export enum UserRole {
  CUSTOMER = 'customer',
  SALES = 'sales',
  STOREKEEPER = 'storekeeper',
  OWNER = 'owner',
  SUPER_ADMIN = 'super_admin'
}

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  phone?: string;
  profileImage?: string;
  createdAt: Date;
  updatedAt: Date;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema(
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
      default: UserRole.CUSTOMER
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

// Hash password before saving
UserSchema.pre('save', async function(this: any, next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password as string, salt);
    next();
  } catch (error) {
    if (error instanceof Error) {
      next(error);
    } else {
      next(new Error('Unknown error occurred during password hashing'));
    }
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
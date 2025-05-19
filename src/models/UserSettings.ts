import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from './User.js';

export interface IUserSettings extends Document {
  user: IUser['_id'];
  email: {
    orderUpdates: boolean;
    promotions: boolean;
    newsletter: boolean;
  };
  push: {
    orderUpdates: boolean;
    promotions: boolean;
    stockAlerts: boolean;
  };
  sms: {
    orderUpdates: boolean;
    promotions: boolean;
  };
  display: {
    darkMode: boolean;
    language: string;
    currency: string;
  };
  privacy: {
    shareDataWithPartners: boolean;
    allowLocationTracking: boolean;
  };
  lowStockAlerts?: boolean;
  stockUpdateNotifications?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSettingsSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    email: {
      orderUpdates: {
        type: Boolean,
        default: true
      },
      promotions: {
        type: Boolean,
        default: true
      },
      newsletter: {
        type: Boolean,
        default: true
      }
    },
    push: {
      orderUpdates: {
        type: Boolean,
        default: true
      },
      promotions: {
        type: Boolean,
        default: false
      },
      stockAlerts: {
        type: Boolean,
        default: false
      }
    },
    sms: {
      orderUpdates: {
        type: Boolean,
        default: false
      },
      promotions: {
        type: Boolean,
        default: false
      }
    },
    display: {
      darkMode: {
        type: Boolean,
        default: false
      },
      language: {
        type: String,
        default: 'en'
      },
      currency: {
        type: String,
        default: 'NGN'
      }
    },
    privacy: {
      shareDataWithPartners: {
        type: Boolean,
        default: false
      },
      allowLocationTracking: {
        type: Boolean,
        default: false
      }
    },
    // Storekeeper specific settings
    lowStockAlerts: {
      type: Boolean,
      default: true
    },
    stockUpdateNotifications: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

UserSettingsSchema.index({ user: 1 });

export default mongoose.model<IUserSettings>('UserSettings', UserSettingsSchema);
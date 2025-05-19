import { Request, Response } from 'express';
import User from '../models/User';
import UserSettings from '../models/UserSettings';

// Get user profile
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user?.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching user profile'
    });
  }
};

// Update user profile
export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    
    // Find user and update
    const user = await User.findByIdAndUpdate(
      req.user?.id,
      { firstName, lastName, email, phone },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while updating user profile'
    });
  }
};

// Get user settings
export const getUserSettings = async (req: Request, res: Response) => {
  try {
    // Find or create user settings
    let userSettings = await UserSettings.findOne({ user: req.user?.id });
    
    if (!userSettings) {
      userSettings = await UserSettings.create({
        user: req.user?.id
      });
    }

    res.status(200).json({
      success: true,
      data: userSettings
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching user settings'
    });
  }
};

// Update user settings
export const updateUserSettings = async (req: Request, res: Response) => {
  try {
    // Extract settings from request body
    const {
      email,
      push,
      sms,
      display,
      privacy,
      lowStockAlerts,
      stockUpdateNotifications
    } = req.body;
    
    // Find or create user settings
    let userSettings = await UserSettings.findOne({ user: req.user?.id });
    
    if (!userSettings) {
      userSettings = await UserSettings.create({
        user: req.user?.id,
        email,
        push,
        sms,
        display,
        privacy,
        lowStockAlerts,
        stockUpdateNotifications
      });
    } else {
      // Update existing settings
      userSettings = await UserSettings.findOneAndUpdate(
        { user: req.user?.id },
        {
          email,
          push,
          sms,
          display,
          privacy,
          lowStockAlerts,
          stockUpdateNotifications
        },
        { new: true, runValidators: true }
      );
    }

    res.status(200).json({
      success: true,
      data: userSettings
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while updating user settings'
    });
  }
};

// Change user password
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Find user
    const user = await User.findById(req.user?.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if current password is correct
    const isMatch = await user.comparePassword(currentPassword);
    
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while changing password'
    });
  }
};
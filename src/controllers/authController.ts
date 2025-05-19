import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import UserSettings from '../models/UserSettings';

// Helper function to generate JWT token
const generateToken = (id: string) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  
  return jwt.sign(
    { id }, 
    process.env.JWT_SECRET, 
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
};

// Register a new user
export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password, firstName, lastName, phone, role } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (userExists) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email or username already exists' 
      });
    }

    // Create new user
    const user = await User.create({
      username,
      email,
      password,
      firstName,
      lastName,
      phone,
      role: role || 'customer'
    });

    // Create default user settings
    await UserSettings.create({
      user: user._id
    });

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred during registration'
    });
  }
};

// Login user
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred during login'
    });
  }
};

// Get current user
export const getCurrentUser = async (req: Request, res: Response) => {
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
      user
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching user data'
    });
  }
};

// Logout user - not necessary for JWT but can be used to invalidate tokens in the future
export const logout = (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};
import mongoose from 'mongoose';

// MongoDB connection
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }
    
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
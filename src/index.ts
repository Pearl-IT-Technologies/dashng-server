import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import productRoutes from './routes/productRoutes';
import notificationRoutes from './routes/notificationRoutes';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up uploads directory for static files
const uploadsDir = path.join(process.cwd(), 'uploads');
console.log('Upload directory absolute path:', uploadsDir);
app.use('/uploads', express.static(uploadsDir));
console.log('Static file middleware set up for /uploads pointing to', uploadsDir);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/notifications', notificationRoutes);

// Root route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to DASH NG API' });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    success: false,
    error: message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

// Create HTTP server
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Set up WebSocket server for real-time updates
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  console.log('WebSocket client connected');

  // Send initial data to client
  ws.send(JSON.stringify({ 
    type: 'connection_established',
    message: 'Connected to DASH NG WebSocket server'
  }));

  // Handle incoming messages using event listeners
  ws.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data.toString());
      console.log('Received message:', data.type);
      
      // Handle different message types
      if (data.type === 'client_stock_update') {
        // Broadcast stock update to all clients
        broadcastStockUpdate(data.productId, data.quantity);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.addEventListener('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Function to broadcast stock updates to all connected clients
function broadcastStockUpdate(productId: number, quantity: number) {
  console.log(`Stock update broadcast: Product ID ${productId} quantity updated to ${quantity}`);
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'stock_update',
        productId,
        quantity
      }));
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running at ws://localhost:${PORT}/ws`);
});
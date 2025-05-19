import { Request, Response } from "express";
import { Order } from "@shared/schema";

interface PaymentGatewayResponse {
  success: boolean;
  message: string;
  data?: any;
  redirectUrl?: string;
  reference?: string;
}

interface VerifyPaymentResponse {
  success: boolean;
  message: string;
  data?: {
    amount: number;
    reference: string;
    status: string;
    transactionId: string;
    gateway: string;
    receiptUrl?: string;
  };
}

interface InitializePaymentOptions {
  amount: number;
  email: string;
  reference?: string;
  callback_url: string;
  metadata?: any;
  currency?: string;
  customer?: {
    name?: string;
    email: string;
    phone?: string;
  };
}

// Mock function for Paystack integration - will be replaced with actual API calls
async function initializePaystackPayment(options: InitializePaymentOptions): Promise<PaymentGatewayResponse> {
  try {
    // In a real implementation, this would make an API call to Paystack
    // Using API_KEY from process.env.PAYSTACK_SECRET_KEY
    
    // Mock success response
    return {
      success: true,
      message: "Payment initialized successfully",
      data: {
        reference: options.reference || `ref-${Date.now()}`,
        authorization_url: `https://paystack.com/checkout/${options.reference || Date.now()}`,
      },
      redirectUrl: `https://paystack.com/checkout/${options.reference || Date.now()}`,
      reference: options.reference || `ref-${Date.now()}`
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to initialize Paystack payment"
    };
  }
}

// Mock function for Flutterwave integration - will be replaced with actual API calls
async function initializeFlutterwavePayment(options: InitializePaymentOptions): Promise<PaymentGatewayResponse> {
  try {
    // In a real implementation, this would make an API call to Flutterwave
    // Using API_KEY from process.env.FLUTTERWAVE_SECRET_KEY
    
    // Mock success response
    return {
      success: true,
      message: "Payment initialized successfully",
      data: {
        reference: options.reference || `ref-${Date.now()}`,
        link: `https://flutterwave.com/checkout/${options.reference || Date.now()}`,
      },
      redirectUrl: `https://flutterwave.com/checkout/${options.reference || Date.now()}`,
      reference: options.reference || `ref-${Date.now()}`
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to initialize Flutterwave payment"
    };
  }
}

// Mock function to verify Paystack payment
async function verifyPaystackPayment(reference: string): Promise<VerifyPaymentResponse> {
  try {
    // In a real implementation, this would verify the payment using Paystack API
    // Using API_KEY from process.env.PAYSTACK_SECRET_KEY
    
    // Mock verification response
    return {
      success: true,
      message: "Payment verified successfully",
      data: {
        amount: 5000,
        reference,
        status: "success",
        transactionId: `trx-${Date.now()}`,
        gateway: "paystack",
        receiptUrl: `https://paystack.com/receipt/${reference}`
      }
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to verify Paystack payment"
    };
  }
}

// Mock function to verify Flutterwave payment
async function verifyFlutterwavePayment(reference: string): Promise<VerifyPaymentResponse> {
  try {
    // In a real implementation, this would verify the payment using Flutterwave API
    // Using API_KEY from process.env.FLUTTERWAVE_SECRET_KEY
    
    // Mock verification response
    return {
      success: true,
      message: "Payment verified successfully",
      data: {
        amount: 5000,
        reference,
        status: "successful",
        transactionId: `trx-${Date.now()}`,
        gateway: "flutterwave",
        receiptUrl: `https://flutterwave.com/receipt/${reference}`
      }
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to verify Flutterwave payment"
    };
  }
}

// Factory function to get the appropriate payment gateway
export function getPaymentGateway(gateway: string) {
  switch (gateway.toLowerCase()) {
    case 'paystack':
      return {
        initialize: initializePaystackPayment,
        verify: verifyPaystackPayment
      };
    case 'flutterwave':
      return {
        initialize: initializeFlutterwavePayment,
        verify: verifyFlutterwavePayment
      };
    default:
      throw new Error(`Unsupported payment gateway: ${gateway}`);
  }
}

// Express middleware to handle payment initialization
export async function initializePayment(req: Request, res: Response) {
  try {
    const {
      amount,
      email,
      gateway,
      reference,
      callback_url,
      metadata,
      currency,
      customer_name,
      customer_phone
    } = req.body;

    if (!amount || !email || !gateway) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: amount, email, gateway"
      });
    }

    const paymentGateway = getPaymentGateway(gateway);
    
    const options: InitializePaymentOptions = {
      amount,
      email,
      reference,
      callback_url: callback_url || `${req.protocol}://${req.get('host')}/api/payment/verify`,
      metadata,
      currency: currency || "NGN",
      customer: {
        email,
        name: customer_name,
        phone: customer_phone
      }
    };

    const response = await paymentGateway.initialize(options);
    
    if (!response.success) {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to initialize payment"
    });
  }
}

// Express middleware to handle payment verification
export async function verifyPayment(req: Request, res: Response) {
  try {
    const { reference, gateway } = req.query;

    if (!reference || !gateway) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: reference, gateway"
      });
    }

    const paymentGateway = getPaymentGateway(gateway as string);
    const response = await paymentGateway.verify(reference as string);
    
    if (!response.success) {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to verify payment"
    });
  }
}

// Function to process partial payment for an order
export async function processPartialPayment(
  orderId: number, 
  amountPaid: number, 
  totalAmount: number, 
  gateway: string,
  reference: string,
  transactionId: string
): Promise<{
  success: boolean,
  message: string,
  updatedOrder?: Order
}> {
  try {
    // In a real implementation, this would update the order in the database
    // This is just a mock implementation
    const remainingAmount = totalAmount - amountPaid;
    const paymentStatus = remainingAmount <= 0 ? "paid" : "partially_paid";
    
    // Mock updated order
    const updatedOrder = {
      id: orderId,
      paymentStatus,
      amountPaid,
      balanceAmount: Math.max(0, remainingAmount),
      paymentReference: reference,
      paymentTransactionId: transactionId,
      paymentGateway: gateway,
      updatedAt: new Date()
    };
    
    return {
      success: true,
      message: paymentStatus === "paid" ? "Payment completed" : "Partial payment processed",
      updatedOrder: updatedOrder as unknown as Order
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to process partial payment"
    };
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        // add other fields like role, email, etc.
      };
    }
  }
}

// This makes the file a module
export {};
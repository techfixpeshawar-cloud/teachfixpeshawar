// Vercel Serverless Function entry point
// Bridges the Express application from server.ts to Vercel Serverless Function runtime.
import 'dotenv/config';
import app from '../server.ts';

export default app;
// Vercel serverless function: POST /api/client-error (see api/_lib/clientError.js).
import { createClientErrorHandler } from './_lib/clientError.js';

export default createClientErrorHandler();

// Vercel serverless function: POST /api/csp-report (see api/_lib/cspReport.js).
import { createCspReportHandler } from './_lib/cspReport.js';

export default createCspReportHandler();

/**
 * Cloudflare Worker Entry Point
 * Routes API requests via Hono and serves static assets
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Import route handlers
import { dashboardStatsRoutes } from './routes/dashboard-stats';
import { chatRoutes } from './routes/chat';
import { conversationsRoutes } from './routes/conversations';
import { auditResultsRoutes } from './routes/audit-results';
import { auditReportsRoutes } from './routes/audit-reports';
import { auditStatisticsRoutes } from './routes/audit-statistics';
import { aggregateReportsRoutes } from './routes/aggregate-reports';
import { syncConversationsRoutes } from './routes/sync-conversations';
import { groundTruthLabelsRoutes } from './routes/ground-truth-labels';
import { reportCacheRoutes } from './routes/report-cache';
import { resetDbRoutes } from './routes/reset-db';
import { wmdpEvaluationsRoutes } from './routes/wmdp-evaluations';
import { toolsRoutes } from './routes/tools';

// Define environment bindings
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  QWEN_API_KEY?: string;
}

// Create Hono app with bindings type
const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Mount API routes
app.route('/api/dashboard-stats', dashboardStatsRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/conversations', conversationsRoutes);
app.route('/api/audit-results', auditResultsRoutes);
app.route('/api/audit-reports', auditReportsRoutes);
app.route('/api/audit-statistics', auditStatisticsRoutes);
app.route('/api/aggregate-reports', aggregateReportsRoutes);
app.route('/api/sync-conversations', syncConversationsRoutes);
app.route('/api/ground-truth-labels', groundTruthLabelsRoutes);
app.route('/api/report-cache', reportCacheRoutes);
app.route('/api/reset-db', resetDbRoutes);
app.route('/api/wmdp-evaluations', wmdpEvaluationsRoutes);
app.route('/api/tools', toolsRoutes);

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve static assets or index.html for client-side routing
app.get('*', async (c) => {
  // Get the requested path
  const url = new URL(c.req.url);
  const path = url.pathname;

  // Check if ASSETS binding is available
  if (!c.env.ASSETS) {
    return c.text('Static assets not configured', 500);
  }

  try {
    // Try to fetch the asset (static file or SPA route)
    const asset = await c.env.ASSETS.fetch(c.req.raw);

    // If asset exists (static file like .js, .css, images), return it
    if (asset.status === 200) {
      return asset;
    }

    // If 404 and not a file extension (SPA route like /dashboard), serve index.html
    if (asset.status === 404 && !path.match(/\.[a-zA-Z0-9]+$/)) {
      const indexUrl = new URL('/index.html', c.req.url);
      const indexAsset = await c.env.ASSETS.fetch(indexUrl);

      // Return index.html with 200 status (not 404) so browser doesn't treat it as error
      return new Response(indexAsset.body, {
        status: 200,
        headers: indexAsset.headers,
      });
    }

    // For actual missing files (like missing-image.png), return 404
    return asset;
  } catch (error) {
    console.error('Error serving asset:', error);
    return c.text('Error loading page', 500);
  }
});

// Export the worker
export default app;

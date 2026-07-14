import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getCostSummary, getCostByKey, getCostByModel, getAllPricing, upsertPricing } from '../services/cost-tracking.js';

export const costTrackingRouter = Router();

// GET /api/cost-tracking/summary?period=30d
costTrackingRouter.get('/summary', (req, res) => {
  const period = (req.query.period as string) || '30d';
  const summary = getCostSummary(period as '24h' | '7d' | '30d' | 'all');
  res.json(summary);
});

// GET /api/cost-tracking/by-key?period=30d
costTrackingRouter.get('/by-key', (req, res) => {
  const period = (req.query.period as string) || '30d';
  const data = getCostByKey(period as '24h' | '7d' | '30d' | 'all');
  res.json(data);
});

// GET /api/cost-tracking/by-model?period=30d
costTrackingRouter.get('/by-model', (req, res) => {
  const period = (req.query.period as string) || '30d';
  const data = getCostByModel(period as '24h' | '7d' | '30d' | 'all');
  res.json(data);
});

// GET /api/cost-tracking/pricing
costTrackingRouter.get('/pricing', (_req, res) => {
  const pricing = getAllPricing();
  res.json(pricing);
});

// POST /api/cost-tracking/pricing
costTrackingRouter.post('/pricing', (req, res) => {
  const { platform, model_id, input_price_per_1k, output_price_per_1k, currency } = req.body;
  if (!platform || !model_id) {
    return res.status(400).json({ error: 'platform and model_id are required' });
  }
  upsertPricing(platform, model_id,
    parseFloat(input_price_per_1k) || 0,
    parseFloat(output_price_per_1k) || 0,
    currency || 'USD');
  res.json({ success: true });
});

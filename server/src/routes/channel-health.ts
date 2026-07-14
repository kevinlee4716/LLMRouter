import { Router } from 'express';
import {
  getAllChannelHealth,
  getHealthSummary,
  resetChannelHealth,
  setChannelEnabled,
  runHealthCheck,
} from '../services/channel-health.js';

export const channelHealthRouter = Router();

// GET /api/channel-health — list all channel health statuses
channelHealthRouter.get('/', (_req, res) => {
  const health = getAllChannelHealth();
  res.json(health);
});

// GET /api/channel-health/summary — health overview
channelHealthRouter.get('/summary', (_req, res) => {
  const summary = getHealthSummary();
  res.json(summary);
});

// POST /api/channel-health/:id/reset — reset a channel to unknown/healthy
channelHealthRouter.post('/:id/reset', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid channel id' });
  resetChannelHealth(id);
  res.json({ success: true });
});

// POST /api/channel-health/:id/toggle — toggle enabled/disabled
channelHealthRouter.post('/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { enabled } = req.body;
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid channel id' });
  setChannelEnabled(id, Boolean(enabled));
  res.json({ success: true });
});

// POST /api/channel-health/:id/check — run a health check now
channelHealthRouter.post('/:id/check', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid channel id' });
  const health = getAllChannelHealth() as Array<{ id: number; key_id: number; platform: string; model_id: string }>;
  const target = health.find(h => h.id === id);
  if (!target) return res.status(404).json({ error: 'Channel not found' });
  const ok = await runHealthCheck(target.key_id, target.platform, target.model_id);
  res.json({ success: ok, status: ok ? 'healthy' : 'degraded' });
});

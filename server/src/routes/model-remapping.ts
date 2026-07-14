import { Router } from 'express';
import {
  getAllRemappings,
  createRemapping,
  updateRemapping,
  deleteRemapping,
  resolveModel,
} from '../services/model-remapping.js';

export const modelRemappingRouter = Router();

// GET /api/model-remapping
modelRemappingRouter.get('/', (_req, res) => {
  const remappings = getAllRemappings();
  res.json(remappings);
});

// POST /api/model-remapping
modelRemappingRouter.post('/', (req, res) => {
  const { source_model, target_model, target_platform, rewrite_body } = req.body;
  if (!source_model || !target_model) {
    return res.status(400).json({ error: 'source_model and target_model are required' });
  }
  createRemapping(source_model, target_model, target_platform || '', Boolean(rewrite_body));
  res.status(201).json({ success: true, source_model, target_model });
});

// PUT /api/model-remapping/:id
modelRemappingRouter.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  updateRemapping(id, req.body);
  res.json({ success: true });
});

// DELETE /api/model-remapping/:id
modelRemappingRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  deleteRemapping(id);
  res.json({ success: true });
});

// POST /api/model-remapping/resolve — test resolve
modelRemappingRouter.post('/resolve', (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model is required' });
  res.json(resolveModel(model));
});

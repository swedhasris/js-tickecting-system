import { Router } from 'express';
import { classifyTicket, suggestResolution, translateToEnglish, aiChat, analyzeActivity, generateSummary, analyzeWork, generateWorkNotes } from '../services/AIService.js';

const router = Router();

router.post('/ai/classify', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    res.json(await classifyTicket(text));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/suggest', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const suggestion = await suggestResolution(text);
    res.json({ suggestion });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/translate', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const translated = await translateToEnglish(text);
    res.json({ translated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const response = await aiChat(message);
    res.json({ response });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/analyze-activity', async (req, res) => {
  try { res.json(await analyzeActivity(req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/generate-summary', async (req, res) => {
  try {
    const { session_data, duration_seconds } = req.body;
    const summary = await generateSummary(session_data || [], duration_seconds || 0);
    res.json({ summary });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/analyze-work', async (req, res) => {
  try {
    if (!req.body.ticketNumber) return res.status(400).json({ error: 'ticketNumber required' });
    res.json(await analyzeWork(req.body));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/generate-notes', async (req, res) => {
  try {
    const note = await generateWorkNotes(req.body);
    res.json({ note });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

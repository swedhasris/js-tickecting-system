import { GoogleGenAI } from '@google/genai';

function getAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({ apiKey: key });
}

function cleanJson(raw: string): string {
  return raw.replace(/```json\s*/g, '').replace(/```/g, '').trim();
}

// ─── Classify ticket ───────────────────────────────────────────────────────────
export async function classifyTicket(text: string): Promise<{ category: string; priority: string }> {
  const ai = getAI();
  if (!ai) return { category: 'Inquiry / Help', priority: 'Medium' };

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Analyze this IT issue and respond ONLY with JSON {"category":"...","priority":"..."}.
Categories: Network, Software, Hardware, Database, "Inquiry / Help"
Priorities: Low, Medium, High, Critical
Issue: "${text}"`,
  });
  try { return JSON.parse(cleanJson(result.text || '{}')); }
  catch { return { category: 'Inquiry / Help', priority: 'Medium' }; }
}

// ─── Suggest resolution ────────────────────────────────────────────────────────
export async function suggestResolution(text: string): Promise<string> {
  const ai = getAI();
  if (!ai) return 'Please create a ticket and our team will assist you shortly.';
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `IT support suggestion (3 sentences max, friendly):\n"${text}"`,
  });
  return result.text?.trim() || 'Please create a ticket.';
}

// ─── Translate Tamil/Tanglish to English ──────────────────────────────────────
export async function translateToEnglish(text: string): Promise<string> {
  const ai = getAI();
  if (!ai) return text;
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Translate Tamil/Tanglish IT issue to professional English. Output ONE clean English sentence only.\nInput: "${text}"`,
  });
  return result.text?.trim() || text;
}

// ─── AI Chat (Kiru) ────────────────────────────────────────────────────────────
export async function aiChat(message: string): Promise<string> {
  const ai = getAI();
  if (!ai) throw new Error('Gemini API key not configured');
  const result = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: `You are Kiru, a friendly IT service management assistant.\nUser: "${message}"\nRespond helpfully and concisely.`,
  });
  return result.text || 'I could not generate a response.';
}

// ─── Analyze activity (vision) ────────────────────────────────────────────────
export async function analyzeActivity(body: any): Promise<any> {
  const ai = getAI();
  if (!ai) return activityFallback(body);

  const { appName, pageType, pageUrl, ticketNumber, idleSeconds, headings, formData, recentKeys, visibleText, screenshot_url } = body;
  const app_ = appName || 'Connect IT';

  const contextText = buildActivityPrompt(body);

  let contents: any = contextText;
  if (screenshot_url) {
    try {
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const p = join(process.cwd(), 'public', screenshot_url);
      if (existsSync(p)) {
        const buf = readFileSync(p);
        const mime = screenshot_url.endsWith('.png') ? 'image/png' : 'image/jpeg';
        contents = [{ text: contextText }, { inlineData: { mimeType: mime, data: buf.toString('base64') } }];
      }
    } catch {}
  }

  const result = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents });
  const raw = cleanJson(result.text || '');
  try {
    const parsed = JSON.parse(raw);
    return {
      activity: parsed.activity || 'General Work',
      description: parsed.description || `Working in ${app_}`,
      confidence: parsed.confidence ?? 0.7,
      detected_app: parsed.app || appName || null,
      detected_website: parsed.website || null,
    };
  } catch { return activityFallback(body); }
}

function buildActivityPrompt(body: any): string {
  const { appName, pageType, pageUrl, pageTitle, ticketNumber, idleSeconds, headings, recentClicks, recentKeys, formData, visibleText } = body;
  const app_ = appName || 'Connect IT';
  return `Analyze this screen activity and return JSON: {"app":"...","website":null,"activity":"...","description":"...","confidence":0.0}
Activity types: Coding, Development, Browsing, Documentation, Communication, Ticket Work, Timesheet Entry, Dashboard Review, Reports Analysis, Idle, Unclear
App: ${app_} | Page: ${pageType||pageUrl} | Title: ${pageTitle||''} | Ticket: ${ticketNumber||''} | Idle: ${idleSeconds||0}s
Headings: ${(headings||[]).join(', ')} | Keys: ${recentKeys||0} | Visible: ${visibleText||''}
Return ONLY valid JSON, no markdown.`;
}

function activityFallback(body: any): any {
  const { appName, pageType, idleSeconds, ticketNumber } = body;
  const app_ = appName || 'Connect IT';
  if (idleSeconds > 60) return { activity: 'Idle', description: `User idle ${idleSeconds}s in ${app_}`, confidence: 0.95, detected_app: app_, detected_website: null };
  const map: Record<string, [string, string]> = {
    'Ticket Detail':  ['Ticket Work',      `Reviewing ticket details${ticketNumber ? ' on ' + ticketNumber : ''} in ${app_}`],
    'Dashboard':      ['Dashboard Review', `Reviewing dashboard in ${app_}`],
    'Reports':        ['Reports Analysis', `Analyzing reports in ${app_}`],
    'Timesheet':      ['Timesheet Entry',  `Updating timesheet in ${app_}`],
    'Settings':       ['Configuration',    `Configuring settings in ${app_}`],
  };
  for (const [k, [act, desc]] of Object.entries(map)) {
    if ((pageType||'').includes(k)) return { activity: act, description: desc, confidence: 0.75, detected_app: app_, detected_website: null };
  }
  return { activity: 'General Work', description: `Working in ${app_} on ${pageType||'application'}`, confidence: 0.6, detected_app: app_, detected_website: null };
}

// ─── Generate session summary ──────────────────────────────────────────────────
export async function generateSummary(sessionData: any[], durationSeconds: number): Promise<string> {
  const ai = getAI();
  if (!ai || !sessionData?.length) {
    const acts = [...new Set(sessionData?.map((e: any) => e.activity))].join(', ');
    return `User worked on: ${acts || 'various tasks'}. Duration: ${Math.floor((durationSeconds||0)/60)} minutes.`;
  }

  const log = sessionData.map((e: any) => `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.activity}: ${e.description}`).join('\n');
  const dur = `${Math.floor(durationSeconds/3600)}h ${Math.floor((durationSeconds%3600)/60)}m`;

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Generate a 2-3 sentence professional timesheet summary.\nDuration: ${dur}\nActivities:\n${log}\nRespond ONLY with JSON: {"summary":"..."}`,
  });
  try { return JSON.parse(cleanJson(result.text || '{}')).summary || 'Session completed.'; }
  catch { return 'Session completed. User was actively working.'; }
}

// ─── Analyze work session ─────────────────────────────────────────────────────
export async function analyzeWork(body: any): Promise<any> {
  const { ticketNumber, ticketTitle, action, elapsedTime } = body;
  const ai = getAI();
  if (!ai) return workFallback(ticketNumber, ticketTitle, action, elapsedTime);

  const dur = elapsedTime ? `\nTime: ${Math.floor(elapsedTime/60)}m ${elapsedTime%60}s` : '';
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Generate a professional IT work note JSON for a technician ${action==='start'?'STARTING':'STOPPING'} work on ${ticketNumber}.
Ticket: ${ticketNumber} - ${ticketTitle||'Incident'}${dur}
Return: {"summary":"...","activityType":"ticket_resolution","confidence":0.8,"actionVerb":"...","detectedActivities":["..."]}`,
  });
  try { return JSON.parse(cleanJson(result.text || '{}')); }
  catch { return workFallback(ticketNumber, ticketTitle, action, elapsedTime); }
}

function workFallback(ticketNumber: string, ticketTitle: string, action: string, elapsedTime?: number): any {
  const verbs = action === 'start'
    ? ['Started working on','Initiated investigation of','Began troubleshooting','Commenced review of']
    : ['Completed work session for','Finished investigation of','Wrapped up review of','Paused work on'];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  const dur = elapsedTime ? `. Duration: ${Math.floor(elapsedTime/60)}m ${elapsedTime%60}s` : '';
  return {
    summary: `${verb} incident ${ticketNumber}: ${ticketTitle||'Service request'}${dur}`,
    activityType: 'ticket_resolution', confidence: 0.7, actionVerb: verb.split(' ')[0],
    detectedActivities: ['Reviewed ticket details'],
  };
}

// ─── Generate work notes ──────────────────────────────────────────────────────
export async function generateWorkNotes(body: any): Promise<string> {
  const { context, ticketNumber, ticketTitle, durationSeconds, userName } = body;
  const ai = getAI();
  if (!ai) return workNoteFallback(context, ticketNumber, ticketTitle, durationSeconds);

  const dur = durationSeconds ? `\nSession: ${Math.floor(durationSeconds/3600)}h ${Math.floor((durationSeconds%3600)/60)}m ${durationSeconds%60}s` : '';
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Generate a 1-2 sentence professional work note for technician ${userName||'Technician'} ${context==='start'?'starting':'stopping'} a session.
Ticket: ${ticketNumber||'N/A'}${ticketTitle?' - '+ticketTitle:''}${dur}
Respond ONLY with JSON: {"note":"..."}`,
  });
  try { return JSON.parse(cleanJson(result.text || '{}')).note || workNoteFallback(context, ticketNumber, ticketTitle, durationSeconds); }
  catch { return workNoteFallback(context, ticketNumber, ticketTitle, durationSeconds); }
}

function workNoteFallback(context: string, ticketNumber?: string, ticketTitle?: string, durationSeconds?: number): string {
  const ticket = ticketNumber ? ` for ${ticketNumber}${ticketTitle ? ': ' + ticketTitle : ''}` : '';
  const dur    = durationSeconds ? ` Duration: ${Math.floor(durationSeconds/3600)}h ${Math.floor((durationSeconds%3600)/60)}m.` : '';
  if (context === 'start') return `Started working${ticket}. Session tracking initiated.`;
  return `Completed work session${ticket}.${dur} Progress saved.`;
}

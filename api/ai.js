export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { provider, apiKey, model, baseUrl, prompt } = req.body;
  if (!apiKey) { res.status(400).json({ error: 'No API key provided' }); return; }
  if (!prompt) { res.status(400).json({ error: 'No prompt provided' }); return; }

  try {
    let text = '';

    if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'Claude error ' + r.status);
      text = data.content?.[0]?.text || '';
    } else {
      const endpoint =
        provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' :
        provider === 'grok'   ? 'https://api.x.ai/v1/chat/completions' :
        (baseUrl || '').replace(/\/$/, '') + '/chat/completions';

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'AI error ' + r.status);
      text = data.choices?.[0]?.message?.content || '';
    }

    text = text.trim();

    // Extract JSON — handle cases where model adds extra text
    const clean = text.replace(/```json|```/gi, '').trim();
    let parsed;

    // Try direct parse first
    try { parsed = JSON.parse(clean); }
    catch {
      // Find JSON object in response
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); }
        catch { return res.status(500).json({ error: 'AI returned invalid JSON. Raw: ' + clean.substring(0, 200) }); }
      } else {
        return res.status(500).json({ error: 'No JSON found in response. Raw: ' + clean.substring(0, 200) });
      }
    }

    if (parsed.tags && parsed.tags.length > 5) parsed.tags = parsed.tags.slice(0, 5);
    res.status(200).json(parsed);

  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10kb' }));

let communaute = [];
const requestCounts = {};
const penseeeCounts = {};

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  if (!requestCounts[ip]) requestCounts[ip] = [];
  requestCounts[ip] = requestCounts[ip].filter(t => now - t < 60000);
  if (requestCounts[ip].length >= 30) {
    return res.status(429).json({ error: 'Trop de requêtes. Réessaie dans une minute.' });
  }
  requestCounts[ip].push(now);
  next();
}

function penseeLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const today = new Date().toLocaleDateString('fr-FR');
  const key = ip + '-' + today;
  if (!penseeeCounts[key]) penseeeCounts[key] = 0;
  if (penseeeCounts[key] >= 10) {
    return res.status(429).json({ error: 'Tu as atteint la limite de 10 pensées par jour.' });
  }
  penseeeCounts[key]++;
  next();
}

app.post('/message', rateLimit, async (req, res) => {
  try {
    const { messages, system, model, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages invalides' });
    if (messages.length > 50) return res.status(400).json({ error: 'Trop de messages' });
    const lastMsg = messages[messages.length - 1]?.content || '';
    if (lastMsg.length > 2000) return res.status(400).json({ error: 'Message trop long' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model, max_tokens, system, messages })
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('Erreur:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/communaute', rateLimit, penseeLimit, (req, res) => {
  const { pensee, prenom, groupe } = req.body;
  if (!pensee || pensee.length > 200) return res.status(400).json({ error: 'Pensée invalide' });
  const entry = {
    id: Date.now(),
    pensee: pensee.trim(),
    prenom: (prenom || 'Anonyme').substring(0, 20),
    groupe: groupe || 'Général',
    coeurs: 0,
    date: new Date().toLocaleDateString('fr-FR')
  };
  communaute.unshift(entry);
  if (communaute.length > 50) communaute.pop();
  res.json(entry);
});

app.get('/communaute', (req, res) => {
  res.json(communaute);
});

app.post('/communaute/:id/coeur', rateLimit, (req, res) => {
  const entry = communaute.find(e => e.id === parseInt(req.params.id));
  if (entry) { entry.coeurs++; res.json(entry); }
  else res.status(404).json({ error: 'Non trouvé' });
});

app.listen(process.env.PORT, () => console.log('Serveur démarré'));

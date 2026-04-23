const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10kb' }));

let communaute = [];
let compteur = 247;
let temoignages = [
  { nom: "Fatou S.", pays: "🇸🇳", avis: "Cette app m'a aidée à gérer mon stress au travail. L'assistant est vraiment empathique !", note: 5 },
  { nom: "Amadou D.", pays: "🇸🇳", avis: "Je parle en wolof et l'IA me comprend ! C'est incroyable. Je l'utilise tous les jours.", note: 5 },
  { nom: "Marie K.", pays: "🇫🇷", avis: "Le journal de bord et les exercices de respiration m'ont vraiment aidée. Merci !", note: 5 },
  { nom: "Ibrahim B.", pays: "🇸🇳", avis: "Enfin une app de bien-être adaptée à nous les Africains. Très bonne initiative !", note: 5 },
  { nom: "Sophie M.", pays: "🇧🇪", avis: "La lettre à mon futur moi est une fonctionnalité unique. J'adore cette app !", note: 5 }
];
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
app.get('/compteur', (req, res) => {
  res.json({ compteur });
});

app.post('/compteur', (req, res) => {
  compteur++;
  res.json({ compteur });
});

app.get('/temoignages', (req, res) => {
  res.json(temoignages);
});
app.listen(process.env.PORT, () => console.log('Serveur démarré'));

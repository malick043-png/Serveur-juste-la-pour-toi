const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10kb' }));

let communaute = [];
let compteur = 247;
let salles = {};
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
  if (requestCounts[ip].length >= 30) return res.status(429).json({ error: 'Trop de requêtes.' });
  requestCounts[ip].push(now);
  next();
}

function penseeLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const today = new Date().toLocaleDateString('fr-FR');
  const key = ip + '-' + today;
  if (!penseeeCounts[key]) penseeeCounts[key] = 0;
  if (penseeeCounts[key] >= 10) return res.status(429).json({ error: 'Limite atteinte.' });
  penseeeCounts[key]++;
  next();
}

async function appelIA(messages, system) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 300, system, messages })
  });
  const data = await response.json();
  return data.content[0].text;
}

// WEBSOCKET - SALLES DE GROUPE
io.on('connection', (socket) => {
  socket.on('rejoindre-salle', ({ salleId, prenom, theme }) => {
    if (!salles[salleId]) {
      salles[salleId] = { membres: [], messages: [], theme: theme || 'Bien-être', createdAt: Date.now() };
    }
    const salle = salles[salleId];
    if (salle.membres.length >= 5) { socket.emit('salle-pleine'); return; }
    salle.membres.push({ id: socket.id, prenom: prenom || 'Anonyme' });
    socket.join(salleId);
    socket.salleId = salleId;
    socket.prenom = prenom || 'Anonyme';
    io.to(salleId).emit('membres-update', salle.membres.map(m => m.prenom));
    io.to(salleId).emit('nouveau-message', { auteur: '💙 Assistant', texte: `Bienvenue ${prenom} ! La salle "${salle.theme}" a maintenant ${salle.membres.length} membre(s). Je suis là pour modérer et vous guider. 💙`, timestamp: new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) });
  });

  socket.on('envoyer-message', async ({ texte }) => {
    const salleId = socket.salleId;
    if (!salleId || !salles[salleId]) return;
    const salle = salles[salleId];
    const msg = { auteur: socket.prenom, texte, timestamp: new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) };
    salle.messages.push(msg);
    io.to(salleId).emit('nouveau-message', msg);

    if (salle.messages.length % 3 === 0) {
      try {
        const historique = salle.messages.slice(-6).map(m => ({ role: 'user', content: m.auteur + ': ' + m.texte }));
        const rep = await appelIA(historique, `Tu es un modérateur bienveillant dans une salle de soutien de groupe sur le thème "${salle.theme}". Il y a ${salle.membres.length} participants anonymes. Interviens de manière bienveillante, encourage l'échange, pose une question ouverte au groupe. Réponds en 2-3 phrases maximum en français.`);
        const msgIA = { auteur: '💙 Assistant', texte: rep, timestamp: new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) };
        salle.messages.push(msgIA);
        io.to(salleId).emit('nouveau-message', msgIA);
      } catch(e) {}
    }
  });

  socket.on('disconnect', () => {
    const salleId = socket.salleId;
    if (salleId && salles[salleId]) {
      salles[salleId].membres = salles[salleId].membres.filter(m => m.id !== socket.id);
      io.to(salleId).emit('membres-update', salles[salleId].membres.map(m => m.prenom));
      if (salles[salleId].membres.length === 0) delete salles[salleId];
    }
  });
});

// Nettoyage des salles après 1h
setInterval(() => {
  const now = Date.now();
  Object.keys(salles).forEach(id => { if (now - salles[id].createdAt > 3600000) delete salles[id]; });
}, 60000);

app.post('/message', rateLimit, async (req, res) => {
  try {
    const { messages, system, model, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages invalides' });
    if (messages.length > 50) return res.status(400).json({ error: 'Trop de messages' });
    const lastMsg = messages[messages.length - 1]?.content || '';
    if (lastMsg.length > 2000) return res.status(400).json({ error: 'Message trop long' });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens, system, messages })
    });
    const data = await response.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/communaute', rateLimit, penseeLimit, (req, res) => {
  const { pensee, prenom, groupe } = req.body;
  if (!pensee || pensee.length > 200) return res.status(400).json({ error: 'Pensée invalide' });
  const entry = { id: Date.now(), pensee: pensee.trim(), prenom: (prenom || 'Anonyme').substring(0, 20), groupe: groupe || 'Général', coeurs: 0, date: new Date().toLocaleDateString('fr-FR') };
  communaute.unshift(entry);
  if (communaute.length > 50) communaute.pop();
  res.json(entry);
});

app.get('/communaute', (req, res) => { res.json(communaute); });

app.post('/communaute/:id/coeur', rateLimit, (req, res) => {
  const entry = communaute.find(e => e.id === parseInt(req.params.id));
  if (entry) { entry.coeurs++; res.json(entry); }
  else res.status(404).json({ error: 'Non trouvé' });
});

app.get('/compteur', (req, res) => { res.json({ compteur }); });
app.post('/compteur', (req, res) => { compteur++; res.json({ compteur }); });
app.get('/temoignages', (req, res) => { res.json(temoignages); });
app.delete('/communaute/:id', (req, res) => {
  const idx = communaute.findIndex(e => e.id === parseInt(req.params.id));
  if (idx >= 0) { communaute.splice(idx, 1); res.json({ success: true }); }
  else res.status(404).json({ error: 'Non trouvé' });
});

app.post('/sessions', (req, res) => {
  res.json({ success: true });
});
app.get('/salles', (req, res) => {
  const sallesPubliques = Object.entries(salles).map(([id, s]) => ({ id, theme: s.theme, membres: s.membres.length })).filter(s => s.membres < 5);
  res.json(sallesPubliques);
});

http.listen(process.env.PORT, () => console.log('Serveur démarré'));

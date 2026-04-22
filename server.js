const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

let communaute = [];

app.post('/message', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('Erreur:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/communaute', (req, res) => {
  const { pensee, prenom } = req.body;
  if (!pensee || pensee.length > 200) return res.status(400).json({ error: 'Pensée invalide' });
  const entry = { id: Date.now(), pensee, prenom: prenom || 'Anonyme', coeurs: 0, date: new Date().toLocaleDateString('fr-FR') };
  communaute.unshift(entry);
  if (communaute.length > 50) communaute.pop();
  res.json(entry);
});

app.get('/communaute', (req, res) => {
  res.json(communaute);
});

app.post('/communaute/:id/coeur', (req, res) => {
  const entry = communaute.find(e => e.id === parseInt(req.params.id));
  if (entry) { entry.coeurs++; res.json(entry); }
  else res.status(404).json({ error: 'Non trouvé' });
});

app.listen(process.env.PORT, () => console.log('Serveur démarré'));

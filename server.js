const express = require('express');
const path = require('path');
const app = express();

// Dit à Express que tous les fichiers publics sont dans le dossier "public"
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    // CORRECTION : On ajoute 'public' dans le chemin
    res.sendFile(path.join(__dirname, 'public','index.html'));
});

app.get('/chat', (req, res) => {
    // CORRECTION : On ajoute 'public' dans le chemin
    res.sendFile(path.join(__dirname, 'public','chat.html'));
});

app.listen(3000, () => {
    console.log(`Serveur en ligne sur http://localhost:3000`);
});
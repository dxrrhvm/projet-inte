const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public','index.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public','chat.html'));
});

app.get('/text', (req, res) => {
    res.sendFile(path.join(__dirname, 'public','text.html'));
});

app.listen(3000, () => {
    console.log(`Serveur en ligne sur http://localhost:3000`);
});
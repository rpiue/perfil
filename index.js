// server.js
const express = require('express');
const path = require('path');
const app = express();

// Define el puerto en el que se ejecutará el servidor
const PORT = process.env.PORT || 3000;

// Usa la carpeta "public" para servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal que envía el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/yape', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'yapeRedirect.html'));
});


// Inicia el servidor
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

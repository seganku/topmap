const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));
app.use(express.json());

const HTTP_PORT = 3080;
const HTTPS_PORT = 3443;

// HTTPS cert and key
const httpsOptions = {
  cert: fs.readFileSync('/etc/letsencrypt/live/ex1.us/fullchain.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/ex1.us/privkey.pem')
};

// Make sure ./state directory exists
const stateDir = path.join(__dirname, 'state');
if (!fs.existsSync(stateDir)) {
  fs.mkdirSync(stateDir);
}

// Get state file path for a session key
function getStateFile(key) {
  return path.join(stateDir, `${key}.json`);
}

// API: Load session-specific state
app.get('/api/state/:key', (req, res) => {
  const key = req.params.key;
  const file = getStateFile(key);
  fs.readFile(file, (err, data) => {
    res.json(err ? {} : JSON.parse(data));
  });
});

// API: Save session-specific state
app.post('/api/state/:key', (req, res) => {
  const key = req.params.key;
  const file = getStateFile(key);
  fs.writeFile(file, JSON.stringify(req.body, null, 2), () => {
    res.json({ status: 'ok' });
  });
});

// Route: Serve index.html for any 12-char alphanumeric key
app.get('/:key', (req, res) => {
  const { key } = req.params;
  if (/^[a-zA-Z0-9]{12}$/.test(key)) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

// Start HTTPS server and attach Socket.IO
const httpsServer = https.createServer(httpsOptions, app);
const io = new Server(httpsServer);

// WebSocket event handling
io.on('connection', (socket) => {
  socket.on('join', (key) => {
    socket.join(key);
  });

  socket.on('update', ({ key, regionId, color }) => {
    socket.to(key).emit('update', { regionId, color });
  });

  socket.on('customColorsUpdate', ({ key }) => {
    socket.to(key).emit('customColorsUpdate');
  });

});

// Start servers
http.createServer(app).listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`HTTP server running on http://0.0.0.0:${HTTP_PORT}`);
});

httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
  console.log(`HTTPS server running on https://0.0.0.0:${HTTPS_PORT}`);
});


const express = require('express');
const http = require('http');
const os = require('os');
const QRCode = require('qrcode');
const { setupWebSocket } = require('./scripts/websocket');
const { loadWorldState } = require('./scripts/persist');

const app = express();
const server = http.createServer(app);

loadWorldState().then((initialState) => {
  setupWebSocket(server, initialState);
});

function getLanIp() {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry && entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }

  return '127.0.0.1';
}

app.get('/connect-info', async (req, res) => {
  try {
    const port = process.env.PORT || 3000;
    const forwardedHost = req.headers['x-forwarded-host'] || req.headers['host'];
    const forwardedProto = req.headers['x-forwarded-proto'] || req.protocol;
    const connectUrl = process.env.PUBLIC_URL
      ? `${process.env.PUBLIC_URL}/`
      : forwardedHost
        ? `${forwardedProto}://${forwardedHost}/`
        : `http://${getLanIp()}:${port}/`;
    const qrDataUrl = await QRCode.toDataURL(connectUrl, {
      width: 320,
      margin: 1,
    });

    res.json({
      connectUrl,
      qrDataUrl,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to generate connect QR code',
    });
  }
});

app.use(express.static('public'));
app.use('/phaser', express.static('node_modules/phaser/dist'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
  console.log(`  Display: http://localhost:${PORT}/server.html`);
  console.log(`  Mobile:  http://<LAN_IP>:${PORT}/`);
});

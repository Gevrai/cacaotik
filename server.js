const express = require('express');
const http = require('http');
const { setupWebSocket } = require('./scripts/websocket');

const app = express();
const server = http.createServer(app);
setupWebSocket(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
  console.log(`  Display: http://localhost:${PORT}/`);
  console.log(`  Mobile:  http://<LAN_IP>:${PORT}/client.html`);
});

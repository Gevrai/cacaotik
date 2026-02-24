const os = require('os');
const path = require('path');

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

const port = process.env.PORT || 3000;
const lanIp = getLanIp();

console.log('');
console.log('  ╔══════════════════════════════════════════════════╗');
console.log('  ║                 CACAOTIQUE  🍫                   ║');
console.log('  ╠══════════════════════════════════════════════════╣');
console.log(`  ║  Display : http://localhost:${port}/server.html  ║`);
console.log(`  ║  Mobile  : http://${lanIp}:${port}               ║`);
console.log('  ╚══════════════════════════════════════════════════╝');
console.log('');

require(path.join(__dirname, '..', 'server.js'));

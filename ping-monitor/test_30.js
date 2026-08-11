const { io } = require('socket.io-client');

console.log('Connecting to server...');
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected! Sending 30 targets...');
  
  const targets = [];
  for (let i = 1; i <= 30; i++) {
    if (i % 3 === 0) {
      targets.push(`127.0.0.${i}`); // local
    } else if (i % 3 === 1) {
      targets.push('8.8.8.8'); // online
    } else {
      targets.push(`invalid-domain-${i}.local`); // invalid
    }
  }

  socket.emit('start-monitoring', {
    targets,
    sourceIP: '',
    intervalMs: 2000
  });
});

socket.on('ping-result', (data) => {
  console.log(`[Result] Target: ${data.target} | Status: ${data.status} | Latency: ${data.latency}ms | Error: ${data.error}`);
});

socket.on('monitoring-started', () => {
  console.log('Monitoring started successfully on server!');
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});

// Run for 15 seconds then exit
setTimeout(() => {
  console.log('Test complete. Exiting...');
  process.exit(0);
}, 15000);

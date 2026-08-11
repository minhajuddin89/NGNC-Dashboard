const { io } = require('socket.io-client');

console.log('Connecting to server...');
const socket = io('http://localhost:3000');

let receivedAfterStop = 0;
let isStopped = false;

socket.on('connect', () => {
  console.log('Connected! Starting monitor...');
  socket.emit('start-monitoring', {
    targets: ['8.8.8.8', '1.1.1.1', '127.0.0.1'],
    sourceIP: '',
    intervalMs: 1000,
    pingMode: 'icmp'
  });
});

socket.on('ping-result', (data) => {
  console.log(`[Result] Target: ${data.target} | Status: ${data.status} | Latency: ${data.latency}ms`);
  if (isStopped) {
    receivedAfterStop++;
    console.warn(`[WARNING] Received ping-result after stop-monitoring! Count: ${receivedAfterStop}`);
  }
});

socket.on('monitoring-started', () => {
  console.log('Monitoring started!');
  
  // Wait 4 seconds then stop
  setTimeout(() => {
    console.log('Emitting stop-monitoring...');
    socket.emit('stop-monitoring');
    isStopped = true;
  }, 4000);
});

socket.on('monitoring-stopped', () => {
  console.log('Received monitoring-stopped confirmation from server!');
});

// Run for 10 seconds then exit
setTimeout(() => {
  console.log(`Test complete. Received after stop: ${receivedAfterStop}`);
  process.exit(receivedAfterStop > 0 ? 1 : 0);
}, 10000);

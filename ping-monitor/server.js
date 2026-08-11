process.env.UV_THREADPOOL_SIZE = 64;
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const os = require('os');
const { spawn } = require('child_process');
const path = require('path');
const dns = require('dns');
const net = require('net');
const dgram = require('dgram');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const globalPlinkShells = new Map();

let extractedPlinkPath = '';

function extractEmbeddedPlink() {
  extractedPlinkPath = path.join(os.tmpdir(), 'PulseTrace_plink.exe');
  try {
    const embeddedPath = path.join(__dirname, 'plink.exe');
    if (fs.existsSync(embeddedPath)) {
      console.log(`[Diagnostic] Extracting embedded plink.exe to: ${extractedPlinkPath}`);
      const plinkBuffer = fs.readFileSync(embeddedPath);
      
      if (fs.existsSync(extractedPlinkPath)) {
        try {
          fs.unlinkSync(extractedPlinkPath);
        } catch (e) {
          console.warn(`[Diagnostic] Temporary plink is locked, skipping extraction: ${e.message}`);
          return;
        }
      }
      
      fs.writeFileSync(extractedPlinkPath, plinkBuffer);
      fs.chmodSync(extractedPlinkPath, 0o755);
      console.log('[Diagnostic] Extraction successful!');
    } else {
      console.warn('[Diagnostic] Embedded plink.exe not found in virtual filesystem!');
    }
  } catch (err) {
    console.error('[Diagnostic] Failed to extract embedded plink.exe:', err.message);
  }
}

// Call on startup
extractEmbeddedPlink();

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d%e&_+=:.?~]*){0,4})?[a-zA-Z]/g, '');
}

class InteractivePlinkShell {
  constructor(config) {
    this.config = config;
    this.child = null;
    this.promptPattern = /[>#\]]$/;
    this.buffer = '';
    this.commandQueue = [];
    this.currentJob = null;
    this.isReady = false;
    this.promptText = '';
  }

  start() {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      let plinkPath = extractedPlinkPath;
      if (!plinkPath || !fs.existsSync(plinkPath)) {
        plinkPath = this.config.plinkPath || 'plink.exe';
        if (plinkPath === 'plink.exe' || plinkPath === './plink.exe' || plinkPath === '.\\plink.exe') {
          plinkPath = path.join(__dirname, 'plink.exe');
        }
      }

      const args = [];
      if (this.config.plinkSession) {
        args.push('-load', this.config.plinkSession);
      } else {
        args.push('-ssh');
        if (this.config.port) args.push('-P', String(this.config.port));
        if (this.config.username) args.push('-l', this.config.username);
        if (this.config.password) args.push('-pw', this.config.password);
        args.push(this.config.host);
      }

      this.child = spawn(plinkPath, args);

      let hasSentHostKey = false;
      let hasSentPassword = false;
      let hasSentDuo = false;

      const handleAuth = (data) => {
        const text = data.toString().toLowerCase();
        if (text.includes('store key in cache') || text.includes('host key') || text.includes('fingerprint') || text.includes('(y/n)')) {
          if (!hasSentHostKey) {
            hasSentHostKey = true;
            console.log(`[InteractivePlinkShell] Prompted for host key. Writing 'y'.`);
            try { this.child.stdin.write('y\n'); } catch (e) {}
          }
        }
        if (text.includes('password:') || text.includes('password :') || text.includes('enter password:')) {
          if (!hasSentPassword) {
            hasSentPassword = true;
            console.log(`[InteractivePlinkShell] Prompted for password. Writing password.`);
            try { this.child.stdin.write(this.config.password + '\n'); } catch (e) {}
          }
        } else if (text.includes('passcode') || text.includes('verification code') || text.includes('choose') || text.includes('option') || text.includes('1.')) {
          if (!hasSentDuo) {
            hasSentDuo = true;
            console.log(`[InteractivePlinkShell] Prompted for Duo. Writing '1'.`);
            try { this.child.stdin.write('1\n'); } catch (e) {}
          }
        }
      };

      // Fallback writes
      const fallbackTimer = setTimeout(() => {
        if (!hasSentPassword && !hasSentHostKey) {
          hasSentPassword = true;
          console.log(`[InteractivePlinkShell] Fallback password write.`);
          try { this.child.stdin.write(this.config.password + '\n'); } catch (e) {}
        }
        setTimeout(() => {
          if (!hasSentDuo && !hasSentHostKey) {
            hasSentDuo = true;
            console.log(`[InteractivePlinkShell] Fallback Duo write.`);
            try { this.child.stdin.write('1\n'); } catch (e) {}
          }
        }, 500);
      }, 400);

      this.child.stdout.on('data', (d) => {
        console.log(`[InteractivePlinkShell stdout]`, d.toString().trim());
        handleAuth(d);
        this.handleOutput(d.toString());
      });

      this.child.stderr.on('data', (d) => {
        console.log(`[InteractivePlinkShell stderr]`, d.toString().trim());
        handleAuth(d);
        this.handleOutput(d.toString());
      });

      // Wait for the prompt to appear to resolve the startup
      const checkPromptInterval = setInterval(() => {
        if (this.isReady) {
          clearInterval(checkPromptInterval);
          clearTimeout(fallbackTimer);
          resolve();
        }
      }, 100);

      this.child.on('close', (code) => {
        clearInterval(checkPromptInterval);
        clearTimeout(fallbackTimer);
        this.isReady = false;
        reject(new Error(`Shell closed prematurely with code ${code}`));
      });
    });
  }

  handleOutput(text) {
    this.buffer += text;
    
    if (this.currentJob && this.currentJob.onData) {
      this.currentJob.onData(text);
    }

    const trimmed = this.buffer.trim();
    const lines = trimmed.split('\n');
    const lastLine = lines[lines.length - 1].trim();

    if (this.promptPattern.test(lastLine)) {
      if (!this.isReady) {
        this.promptText = lastLine;
        this.isReady = true;
        this.buffer = ''; // clear login banner
      } else if (this.currentJob) {
        const job = this.currentJob;
        this.currentJob = null;
        this.buffer = '';
        job.resolve(trimmed);
        this.runNextJob();
      }
    }
  }

  getHostname() {
    if (!this.promptText) return '';
    let hostname = this.promptText.replace(/[<>#\]\[]/g, '').trim();
    if (hostname.includes('@')) {
      hostname = hostname.split('@')[1];
    }
    hostname = hostname.replace(/[>#]/g, '').trim();
    return hostname;
  }

  execCommand(cmd, timeoutMs = 4000, onData = null, socketId = null, isHighPriority = false) {
    return new Promise((resolve, reject) => {
      const job = { 
        cmd, 
        onData,
        timeoutMs,
        socketId,
        resolve: (val) => {
          resolve(val);
        }, 
        reject: (err) => {
          reject(err);
        } 
      };

      if (isHighPriority) {
        this.commandQueue.unshift(job);
      } else {
        this.commandQueue.push(job);
      }

      if (!this.currentJob && this.isReady) {
        this.runNextJob();
      }
    });
  }

  runNextJob() {
    if (this.commandQueue.length === 0) return;
    this.currentJob = this.commandQueue.shift();
    this.buffer = '';

    const currentJob = this.currentJob;
    const timeoutId = setTimeout(() => {
      if (this.currentJob === currentJob) {
        console.warn(`[InteractivePlinkShell] Command timed out: ${currentJob.cmd}. Sending Ctrl+C to abort.`);
        try {
          this.child.stdin.write('\x03\n');
        } catch (e) {
          console.error('[InteractivePlinkShell] Failed to write Ctrl+C:', e.message);
        }
        this.currentJob = null;
        this.buffer = '';
        currentJob.reject(new Error('Command timeout'));
        setTimeout(() => {
          this.runNextJob();
        }, 500);
      }
    }, currentJob.timeoutMs || 4000);

    const resolveOriginal = currentJob.resolve;
    const rejectOriginal = currentJob.reject;

    currentJob.resolve = (val) => {
      clearTimeout(timeoutId);
      resolveOriginal(val);
    };

    currentJob.reject = (err) => {
      clearTimeout(timeoutId);
      rejectOriginal(err);
    };

    try {
      this.child.stdin.write(currentJob.cmd + '\n');
    } catch (e) {
      clearTimeout(timeoutId);
      currentJob.reject(e);
      this.currentJob = null;
    }
  }

  hasTracerouteActive() {
    if (this.currentJob && (this.currentJob.cmd.includes('tracert') || this.currentJob.cmd.includes('traceroute'))) {
      return true;
    }
    return this.commandQueue.some(job => job.cmd.includes('tracert') || job.cmd.includes('traceroute'));
  }

  abortCurrentJob(reason = 'Aborted') {
    if (this.currentJob) {
      console.log(`[InteractivePlinkShell] Aborting active job: ${this.currentJob.cmd}`);
      if (this.currentJob.cmd.includes('tracert') || this.currentJob.cmd.includes('traceroute')) {
        try {
          io.emit('router-tracing-status', { host: this.config.host, all: true, active: false });
        } catch (err) {}
      }
      const job = this.currentJob;
      this.currentJob = null;
      this.buffer = '';
      try {
        this.child.stdin.write('\x03\n');
      } catch (e) {}
      job.reject(new Error(reason));
      setTimeout(() => {
        this.runNextJob();
      }, 500);
    }
  }

  cancelJobsForSocket(socketId) {
    if (!socketId) return;
    
    // 1. Remove all pending jobs for this socket from the queue
    this.commandQueue = this.commandQueue.filter(job => {
      if (job.socketId === socketId) {
        job.reject(new Error('Cancelled due to socket disconnect'));
        return false;
      }
      return true;
    });

    // 2. If the current running job belongs to this socket, abort it!
    if (this.currentJob && this.currentJob.socketId === socketId) {
      console.log(`[InteractivePlinkShell] Aborting active job for disconnected socket ${socketId}: ${this.currentJob.cmd}`);
      this.abortCurrentJob('Cancelled due to socket disconnect');
    }
  }

  close() {
    if (this.child) {
      try { this.child.kill('SIGKILL'); } catch (e) {}
      this.child = null;
    }
    this.isReady = false;
  }
}

function executeCommandViaPlink(config, cmd) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    let plinkPath = config.plinkPath || 'plink.exe';
    if (plinkPath === 'plink.exe' || plinkPath === './plink.exe' || plinkPath === '.\\plink.exe') {
      plinkPath = path.join(__dirname, 'plink.exe');
    }
    const args = [];
    
    if (config.plinkSession) {
      args.push('-load', config.plinkSession);
    } else {
      args.push('-ssh');
      if (config.port) args.push('-P', String(config.port));
      if (config.username) args.push('-l', config.username);
      if (config.password) args.push('-pw', config.password);
      args.push(config.host);
    }
    
    args.push(cmd);

    console.log(`[Diagnostic] Spawning plink: "${plinkPath}" ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

    const child = spawn(plinkPath, args);
    let stdout = '';
    let stderr = '';

    let silenceTimer;
    const resetSilenceTimer = () => {
      clearTimeout(silenceTimer);
      if (stdout.trim().length > 0) {
        silenceTimer = setTimeout(() => {
          console.log(`[Diagnostic] Plink stdout silent for 2.5s after receiving data. Resolving...`);
          try { child.kill('SIGTERM'); } catch (e) {}
        }, 2500);
      }
    };

    // Auto-accept host key prompt ONLY if it appears in stdout/stderr to prevent stealing the password stdin field
    let hasSentHostKey = false;
    let hasSentPassword = false;
    let hasSentDuo = false;

    const handlePrompt = (data) => {
      const text = data.toString().toLowerCase();
      if (text.includes('store key in cache') || text.includes('host key') || text.includes('fingerprint') || text.includes('(y/n)')) {
        if (!hasSentHostKey) {
          hasSentHostKey = true;
          console.log(`[Diagnostic] Plink prompted for host key. Writing 'y'.`);
          try { child.stdin.write('y\n'); } catch (e) {}
        }
      }
      if (text.includes('password:') || text.includes('password :') || text.includes('enter password:')) {
        if (!hasSentPassword) {
          hasSentPassword = true;
          console.log(`[Diagnostic] Plink prompted for password. Writing to stdin.`);
          try { child.stdin.write(config.password + '\n'); } catch (e) {}
        }
      } else if (text.includes('passcode') || text.includes('verification code') || text.includes('choose') || text.includes('option') || text.includes('1.')) {
        if (!hasSentDuo) {
          hasSentDuo = true;
          console.log(`[Diagnostic] Plink prompted for Duo. Writing '1'.`);
          try { child.stdin.write('1\n'); } catch (e) {}
        }
      }
    };

    // Fallback: Write password and Duo option after a delay in case the prompts bypass standard stdout/stderr streams on Windows
    setTimeout(() => {
      if (!hasSentPassword && !hasSentHostKey) {
        hasSentPassword = true;
        console.log(`[Diagnostic] Plink fallback password write.`);
        try { child.stdin.write(config.password + '\n'); } catch (e) {}
      }
      setTimeout(() => {
        if (!hasSentDuo && !hasSentHostKey) {
          hasSentDuo = true;
          console.log(`[Diagnostic] Plink fallback Duo write.`);
          try { child.stdin.write('1\n'); } catch (e) {}
        }
      }, 500);
    }, 400);

    child.stdout.on('data', (d) => { 
      stdout += d.toString(); 
      handlePrompt(d);
      resetSilenceTimer();
    });
    child.stderr.on('data', (d) => { 
      stderr += d.toString(); 
      handlePrompt(d);
      resetSilenceTimer();
    });

    const timeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (e) {}
      reject(new Error('Connection timed out waiting for DUO/Router response (90s limit)'));
    }, 90000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      clearTimeout(silenceTimer);
      
      // If we got stdout, resolve successfully regardless of exit code (since we might have SIGTERM'd it)
      if (stdout.trim().length > 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `plink exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      clearTimeout(silenceTimer);
      reject(err);
    });
  });
}

function pingHostRemotePlink(config, routerType, host, cb, source, socketId) {
  let cmd = '';
  if (routerType === 'mikrotik') {
    cmd = `/ping address=${host} count=1${source ? ' src-address=' + source : ''}`;
  } else if (routerType === 'cisco') {
    cmd = `ping ${host}${source ? ' source ' + source : ''} repeat 1 timeout 1`;
  } else if (routerType === 'huawei') {
    cmd = `ping ${source ? '-a ' + source : ''} -c 1 -t 800 ${host}`;
  } else {
    cmd = `ping ${source ? '-I ' + source : ''} -c 1 -W 1 ${host}`;
  }

  const cleanHost = host.replace(/[^a-zA-Z0-9\.\-]/g, '');
  const finalCmd = cmd.replace(host, cleanHost);

  const handleResult = (output) => {
    let isOnline = false;
    let latency = null;
    const cleanOutput = stripAnsi(output);

    if (routerType === 'mikrotik') {
      isOnline = cleanOutput.includes('received=1') || cleanOutput.includes('packet-loss=0%');
      if (isOnline) {
        const match = cleanOutput.match(/avg-rtt=(\d+)ms/);
        if (match) latency = parseInt(match[1], 10);
      }
    } else if (routerType === 'cisco') {
      isOnline = cleanOutput.includes('Success rate is 100 percent');
      if (isOnline) {
        const match = cleanOutput.match(/min\/avg\/max = \d+\/(\d+)\/\d+/);
        if (match) latency = parseInt(match[1], 10);
      }
    } else if (routerType === 'huawei') {
      isOnline = cleanOutput.includes('1 packet(s) received') || cleanOutput.includes('Reply from');
      if (isOnline) {
        const match = cleanOutput.match(/time=(\d+)\s*ms/);
        if (match) latency = parseInt(match[1], 10);
      }
    } else {
      isOnline = cleanOutput.includes('1 packets transmitted, 1 received') || cleanOutput.includes(' 0% packet loss') || cleanOutput.includes('1 received');
      if (isOnline) {
        const match = cleanOutput.match(/time=(\d+)\s*ms/);
        if (match) latency = Math.round(parseFloat(match[1]));
      }
    }

    if (isOnline) {
      cb(null, { status: 'online', latency: latency || 1, raw: cleanOutput });
    } else {
      cb(null, { status: 'offline', error: 'No reply', raw: cleanOutput });
    }
  };

  const shell = globalPlinkShells.get(config.host);
  if (shell && shell.isReady) {
    shell.execCommand(finalCmd, 4000, null, socketId)
      .then(handleResult)
      .catch(err => {
        console.error(`[InteractivePlinkShell] execCommand error:`, err.message);
        cb(err);
      });
  } else {
    cb(null, { status: 'offline', error: 'Router not connected', raw: 'Router is not logged in.' });
  }
}

function getKeyboardInteractiveHandler(password) {
  return (name, instructions, instructionsLang, prompts, finish) => {
    console.log(`[Diagnostic] Keyboard-interactive prompts:`, prompts.map(p => p.prompt));
    const responses = prompts.map(p => {
      const promptText = p.prompt.toLowerCase();
      if (promptText.includes('password')) {
        return password;
      } else if (promptText.includes('passcode') || promptText.includes('option') || promptText.includes('1.') || promptText.includes('choose')) {
        return '1'; // Duo Push
      }
      return password || '';
    });
    finish(responses);
  };
}

// Helper to get local network interface IPs
function getLocalInterfaces() {
  const interfaces = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Filter for IPv4 and non-loopback addresses
      if (net.family === 'IPv4' && !net.internal) {
        results.push({
          name: name,
          address: net.address
        });
      }
    }
  }
  return results;
}

// Helper to determine if an IP is in a private subnet range
function isPrivateIp(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  
  // 100.0.0.0/8 (CGNAT / User requested private block)
  if (parts[0] === 100) return true;

  // 157.0.0.0/8 (User requested private block)
  if (parts[0] === 157) return true;
  
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  // 127.0.0.0/8
  if (parts[0] === 127) return true;
  
  // 169.254.0.0/16
  if (parts[0] === 169 && parts[1] === 254) return true;
  
  return false;
}

// Helper to get active local IP connected to the internet/LAN
function getActiveLocalIp() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    socket.connect(53, '8.8.8.8', () => {
      const ip = socket.address().address;
      socket.close();
      resolve(ip);
    });
    socket.on('error', () => {
      // Fallback: return first non-loopback IPv4 address
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            resolve(net.address);
            return;
          }
        }
      }
      resolve('127.0.0.1');
    });
  });
}

// Function to execute a single ping using Windows ping command (Robust version)
function pingHost(target, sourceIP, callback) {
  const args = ['-n', '1', '-w', '1500'];
  if (sourceIP && sourceIP.trim() !== '') {
    args.push('-S', sourceIP.trim());
  }
  args.push(target);

  let callbackCalled = false;
  const safeCallback = (err, result) => {
    if (callbackCalled) return;
    callbackCalled = true;
    clearTimeout(safetyTimeout);
    callback(err, result);
  };

  const child = spawn('ping', args);
  
  // Safety Timeout: Kill the process if it hangs for more than 2 seconds
  const safetyTimeout = setTimeout(() => {
    console.log(`Ping process for ${target} hung. Force killing.`);
    try {
      child.kill('SIGKILL');
    } catch (e) {}
    safeCallback(null, { status: 'offline', error: 'Process timeout', raw: '' });
  }, 2000);

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', (code) => {
    const timeMatch = stdout.match(/time(?:=|<)(\d+)ms/i);
    const generalFailure = stdout.includes('General failure') || stdout.includes('transmit failed') || stderr.includes('General failure');
    const unreachable = stdout.includes('Destination host unreachable');
    const timeout = stdout.includes('Request timed out');

    if (timeMatch) {
      const latency = parseInt(timeMatch[1], 10);
      safeCallback(null, { status: 'online', latency, raw: stdout.trim() });
    } else {
      let errorReason = 'Offline';
      if (generalFailure) {
        errorReason = 'General failure (Check Source IP binding)';
      } else if (unreachable) {
        errorReason = 'Destination host unreachable';
      } else if (timeout) {
        errorReason = 'Request timed out';
      } else if (stdout.includes('could not find host')) {
        errorReason = 'Host not found';
      }
      safeCallback(null, { status: 'offline', error: errorReason, raw: stdout.trim() || stderr.trim() });
    }
  });

  child.on('error', (err) => {
    console.error(`Failed to spawn ping for ${target}:`, err.message);
    safeCallback(null, { status: 'offline', error: `Spawn error: ${err.message}`, raw: '' });
  });
}

// Function to execute ping via SSH on a remote router
function pingHostRemote(sshConn, routerType, host, cb, source, needsPty) {
  let cmd = '';
  if (routerType === 'mikrotik') {
    if (source) {
      if (net.isIP(source)) {
        cmd = `/ping address=${host} src-address=${source} count=1`;
      } else {
        cmd = `/ping address=${host} interface=${source} count=1`;
      }
    } else {
      cmd = `/ping address=${host} count=1`;
    }
  } else if (routerType === 'cisco') {
    if (source) {
      cmd = `ping ${host} source ${source} repeat 1 timeout 1`;
    } else {
      cmd = `ping ${host} repeat 1 timeout 1`;
    }
  } else if (routerType === 'huawei') {
    if (source) {
      if (net.isIP(source)) {
        cmd = `ping -a ${source} -c 1 -t 1000 ${host}`;
      } else {
        cmd = `ping -i ${source} -c 1 -t 1000 ${host}`;
      }
    } else {
      cmd = `ping -c 1 -t 1000 ${host}`;
    }
  } else {
    if (source) {
      cmd = `ping -I ${source} -c 1 -W 1 ${host}`;
    } else {
      cmd = `ping -c 1 -W 1 ${host}`;
    }
  }

  const cleanHost = host.replace(/[^a-zA-Z0-9\.\-]/g, '');
  let called = false;
  let timeoutId = null;

  console.log(`[Diagnostic] Executing remote command on ${routerType}: "${cmd.replace(host, cleanHost)}"`);

  try {
    const execOptions = needsPty ? { pty: true } : {};
    sshConn.exec(cmd.replace(host, cleanHost), execOptions, (err, stream) => {
      if (err) {
        console.error(`[Diagnostic] sshConn.exec error for ${host}:`, err.message);
        if (!called) {
          called = true;
          cb(err);
        }
        return;
      }

      console.log(`[Diagnostic] SSH channel opened for ${host}`);

      timeoutId = setTimeout(() => {
        if (!called) {
          called = true;
          console.warn(`[Diagnostic] Timeout triggered for ${host} after 3s`);
          try {
            stream.close();
          } catch (e) {}
          cb(null, { status: 'offline', error: 'Ping Timeout', raw: '' });
        }
      }, 3000);

      let output = '';
      let errorOutput = '';

      stream.on('data', (data) => {
        const str = data.toString();
        output += str;
        console.log(`[Diagnostic] stdout from ${host}: ${str.trim()}`);
      });

      stream.stderr.on('data', (data) => {
        const str = data.toString();
        errorOutput += str;
        console.warn(`[Diagnostic] stderr from ${host}: ${str.trim()}`);
      });

      stream.on('close', () => {
        console.log(`[Diagnostic] SSH channel closed for ${host}`);
        if (timeoutId) clearTimeout(timeoutId);
        if (called) return;
        called = true;

        let isOnline = false;
        let latency = null;

        const cleanOutput = stripAnsi(output);
        const cleanError = stripAnsi(errorOutput);

        if (routerType === 'mikrotik') {
          isOnline = cleanOutput.includes('received=1') || cleanOutput.includes('packet-loss=0%');
          if (isOnline) {
            const match = cleanOutput.match(/avg-rtt=(\d+)ms/);
            if (match) latency = parseInt(match[1], 10);
            else {
              const minMatch = cleanOutput.match(/min-rtt=(\d+)ms/);
              if (minMatch) latency = parseInt(minMatch[1], 10);
            }
          }
        } else if (routerType === 'cisco') {
          isOnline = cleanOutput.includes('Success rate is 100 percent') || cleanOutput.includes('(1/1)');
          if (isOnline) {
            const match = cleanOutput.match(/min\/avg\/max = \d+\/(\d+)\/\d+/);
            if (match) latency = parseInt(match[1], 10);
          }
        } else if (routerType === 'huawei') {
          isOnline = cleanOutput.includes('1 packet(s) received') || cleanOutput.includes('Reply from');
          if (isOnline) {
            const match = cleanOutput.match(/time=(\d+)\s*ms/);
            if (match) latency = parseInt(match[1], 10);
            else {
              const avgMatch = cleanOutput.match(/min\/avg\/max = \d+\/(\d+)\/\d+/);
              if (avgMatch) latency = parseInt(avgMatch[1], 10);
            }
          }
        } else {
          isOnline = cleanOutput.includes('1 packets transmitted, 1 received') || cleanOutput.includes('1 packets transmitted, 1 packets received') || cleanOutput.includes(' 0% packet loss') || cleanOutput.includes('bytes from') || cleanOutput.includes('1 received');
          if (isOnline) {
            const match = cleanOutput.match(/time=(\d+(?:\.\d+)?)\s*ms/);
            if (match) latency = Math.round(parseFloat(match[1]));
          }
        }

        console.log(`[Diagnostic] Ping result for ${host}: online=${isOnline}, latency=${latency}, error=${cleanError.trim()}`);

        if (isOnline) {
          cb(null, { status: 'online', latency: latency || 1, raw: cleanOutput });
        } else {
          let fallbackError = cleanError.trim() || 'No reply';
          if (cleanOutput.includes('Request timed out') || cleanOutput.includes('time out')) {
            fallbackError = 'Request timed out';
          } else if (cleanOutput.includes('Destination host unreachable') || cleanOutput.includes('unreachable')) {
            fallbackError = 'Destination host unreachable';
          }
          cb(null, { status: 'offline', error: fallbackError, raw: cleanOutput });
        }
      });
    });
  } catch (execErr) {
    if (timeoutId) clearTimeout(timeoutId);
    if (!called) {
      called = true;
      cb(execErr);
    }
  }
}

// Function to execute a native Node.js TCP ping
function pingHostTcp(target, port, sourceIP, callback) {
  const startTime = Date.now();
  let callbackCalled = false;
  
  const socket = new net.Socket();
  
  const safeCallback = (err, result) => {
    if (callbackCalled) return;
    callbackCalled = true;
    try {
      socket.destroy();
    } catch (e) {}
    clearTimeout(timeoutId);
    callback(err, result);
  };

  const options = {
    host: target,
    port: parseInt(port, 10) || 80
  };

  if (sourceIP && sourceIP.trim() !== '' && net.isIP(sourceIP.trim())) {
    options.localAddress = sourceIP.trim();
  }

  const timeoutId = setTimeout(() => {
    safeCallback(null, { status: 'offline', error: 'Connection timed out', raw: 'Timeout' });
  }, 1500); // 1.5-second timeout

  socket.connect(options, () => {
    const duration = Date.now() - startTime;
    safeCallback(null, { status: 'online', latency: duration, raw: `Connected to ${target}:${port} in ${duration}ms` });
  });

  socket.on('error', (err) => {
    const duration = Date.now() - startTime;
    if (err.code === 'ECONNREFUSED') {
      // Host is online but port is closed (responded with TCP RST)
      safeCallback(null, { status: 'online', latency: duration, raw: `Connection refused (Host is online) in ${duration}ms` });
    } else {
      safeCallback(null, { status: 'offline', error: err.message, raw: err.stack || err.message });
    }
  });
}

// Function to execute a native Node.js UDP ping
function pingHostUdp(target, port, sourceIP, callback) {
  const startTime = Date.now();
  let callbackCalled = false;
  
  const socket = dgram.createSocket('udp4');
  
  const safeCallback = (err, result) => {
    if (callbackCalled) return;
    callbackCalled = true;
    try {
      socket.close();
    } catch (e) {}
    clearTimeout(timeoutId);
    callback(err, result);
  };

  const portVal = parseInt(port, 10) || 53;

  if (sourceIP && sourceIP.trim() !== '' && net.isIP(sourceIP.trim())) {
    try {
      socket.bind({ address: sourceIP.trim(), exclusive: true });
    } catch (e) {}
  }

  const timeoutId = setTimeout(() => {
    // For UDP, if we get no response, we assume it's offline (or firewalled)
    safeCallback(null, { status: 'offline', error: 'No response / Timeout', raw: 'Timeout' });
  }, 1500); // 1.5-second timeout

  const message = Buffer.from([0x00]);
  socket.send(message, 0, message.length, portVal, target, (err) => {
    if (err) {
      safeCallback(null, { status: 'offline', error: err.message, raw: err.stack || err.message });
    }
  });

  socket.on('message', () => {
    const duration = Date.now() - startTime;
    safeCallback(null, { status: 'online', latency: duration, raw: `Received UDP response in ${duration}ms` });
  });

  socket.on('error', (err) => {
    const duration = Date.now() - startTime;
    if (err.code === 'ECONNRESET' || err.code === 'ENETRESET') {
      // On Windows, ICMP Port Unreachable returns ECONNRESET on the UDP socket
      safeCallback(null, { status: 'online', latency: duration, raw: `Connection reset (Host is online) in ${duration}ms` });
    } else {
      safeCallback(null, { status: 'offline', error: err.message, raw: err.stack || err.message });
    }
  });
}

// Cache for IP Info to avoid rate limits
const ipInfoCache = new Map();

// Get neighboring IPv4 addresses (+/- maxOffset)
function getNeighboringIPs(ipStr, maxOffset = 20) {
  if (!net.isIPv4(ipStr)) return [];
  const parts = ipStr.split('.').map(Number);
  const lastOctet = parts[3];
  const neighbors = [];
  // Outward scan: 1, -1, 2, -2, ... up to maxOffset
  for (let i = 1; i <= maxOffset; i++) {
    const up = lastOctet + i;
    const down = lastOctet - i;
    if (up > 0 && up < 255) {
      neighbors.push(`${parts[0]}.${parts[1]}.${parts[2]}.${up}`);
    }
    if (down > 0 && down < 255) {
      neighbors.push(`${parts[0]}.${parts[1]}.${parts[2]}.${down}`);
    }
  }
  return neighbors;
}

// Generate the remaining IPs in the /24 subnet, ordered outwards from lastOctet
function getRemainingIPsInSubnet(ipStr, startOffset = 21) {
  if (!net.isIPv4(ipStr)) return [];
  const parts = ipStr.split('.').map(Number);
  const lastOctet = parts[3];
  const remaining = [];
  
  // We scan from startOffset up to 254 (maximum possible distance is 254)
  for (let i = startOffset; i <= 254; i++) {
    const up = lastOctet + i;
    const down = lastOctet - i;
    
    // Push them in alternating order so we scan outwards
    if (up > 0 && up < 255) {
      remaining.push(`${parts[0]}.${parts[1]}.${parts[2]}.${up}`);
    }
    if (down > 0 && down < 255) {
      remaining.push(`${parts[0]}.${parts[1]}.${parts[2]}.${down}`);
    }
  }
  return remaining;
}

// Search for a nearby pingable IP address using a hybrid parallel/serial approach
function findNearbyPingableIp(targetIp, sourceIP, pingMode, tcpPort, callback, customPingFn) {
  // Phase 1: Fast Parallel Scan (+/- 20)
  const fastNeighbors = getNeighboringIPs(targetIp, 20);
  if (fastNeighbors.length === 0) {
    return callback(null, null);
  }

  let resolved = false;
  let pending = fastNeighbors.length;

  const pingFn = customPingFn || (pingMode === 'tcp'
    ? (host, ip, cb) => pingHostTcp(host, tcpPort, ip, cb)
    : (pingMode === 'udp'
      ? (host, ip, cb) => pingHostUdp(host, tcpPort, ip, cb)
      : (host, ip, cb) => pingHost(host, ip, cb)));

  const startSerialScan = () => {
    if (resolved) return;
    
    console.log(`Phase 1 (+/- 20) failed for ${targetIp}. Starting Phase 2 (Slow Serial Subnet Scan)...`);
    const slowNeighbors = getRemainingIPsInSubnet(targetIp, 21);
    if (slowNeighbors.length === 0) {
      return callback(null, null);
    }

    let currentIndex = 0;

    const scanNext = () => {
      if (resolved) return;
      if (currentIndex >= slowNeighbors.length) {
        console.log(`Phase 2 complete. No pingable IP found in /24 subnet for ${targetIp}.`);
        return callback(null, null);
      }

      const nextIp = slowNeighbors[currentIndex];
      currentIndex++;

      pingFn(nextIp, sourceIP, (err, result) => {
        if (resolved) return;

        if (!err && result && result.status === 'online') {
          resolved = true;
          console.log(`Phase 2 found active IP: ${nextIp}`);
          return callback(null, nextIp);
        }

        // Wait 80ms before scanning the next IP to prevent firewalls from flagging us
        setTimeout(scanNext, 80);
      });
    };

    scanNext();
  };

  fastNeighbors.forEach(neighbor => {
    pingFn(neighbor, sourceIP, (err, result) => {
      if (resolved) return;

      if (!err && result && result.status === 'online') {
        resolved = true;
        console.log(`Phase 1 found active IP: ${neighbor}`);
        return callback(null, neighbor);
      }

      pending--;
      if (pending === 0 && !resolved) {
        // Phase 1 failed, trigger Phase 2
        startSerialScan();
      }
    });
  });
}

function getIpInfo(ip, callback) {
  if (ipInfoCache.has(ip)) {
    return callback(null, ipInfoCache.get(ip));
  }

  const url = `http://ip-api.com/json/${ip}?fields=as,isp,org`;
  
  http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const info = {
          as: json.as || 'Unknown AS',
          isp: json.isp || json.org || 'Unknown ISP'
        };
        ipInfoCache.set(ip, info);
        callback(null, info);
      } catch (e) {
        callback(e);
      }
    });
  }).on('error', (err) => {
    callback(err);
  });
}

// Store active jobs per socket connection
const activeJobs = new Map();
const activeTraceroutes = new Map();
const globalMtrs = new Map(); // target -> mtrSession

let publicIp = 'Detecting...';

function fetchJsonHttps(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isPost = options.method === 'POST';
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ...options.headers
      },
      timeout: 5000
    };

    if (isPost && options.body) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = https.request(url, reqOptions, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Status ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    if (isPost && options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function fetchPublicIp() {
  const apis = [
    'https://api.ipify.org?format=json',
    'https://ipinfo.io/json',
    'https://api.myip.com',
    'https://ipapi.co/json'
  ];
  
  for (const api of apis) {
    try {
      const data = await fetchJsonHttps(api);
      const ip = data.ip || data.query || data.ip_address;
      if (ip) {
        publicIp = ip;
        console.log(`Detected Public IP: ${publicIp}`);
        io.emit('public-ip', publicIp);
        return;
      }
    } catch (err) {
      console.warn(`Failed to fetch public IP from ${api}:`, err.message);
    }
  }
  publicIp = 'Unavailable';
  io.emit('public-ip', publicIp);
}

// Start detecting public IP on startup
fetchPublicIp();

const connectedClients = new Set();
let shutdownTimeout = null;


io.on('connection', (socket) => {
  connectedClients.add(socket.id);
  console.log(`Client connected: ${socket.id}. Total connected: ${connectedClients.size}`);
  if (shutdownTimeout) {
    console.log('Cancelling scheduled server shutdown.');
    clearTimeout(shutdownTimeout);
    shutdownTimeout = null;
  }

  // Send local interfaces and public IP to client immediately
  socket.emit('interfaces', getLocalInterfaces());
  socket.emit('public-ip', publicIp);

  // Handle start monitoring request
  socket.on('start-monitoring', async (config) => {
    const { targets, sourceIP: clientSourceIp, intervalMs, pingMode, tcpPort, executionSource, routerConfig } = config;
    const sourceIP = clientSourceIp || '';
    
    // Stop any existing jobs for this socket first
    stopJobsForSocket(socket.id);
    stopAllBackgroundMtrs();

    const jobs = [];
    const interval = Math.max(intervalMs || 2000, 1000); // Minimum 1 second interval

    const fallbackParentMap = new Map(); // fallbackIp -> parentHost
    const parentToFallbackMap = new Map(); // parentHost -> fallbackIp
    const searchingTargets = new Set();
    const consecutiveLosses = new Map(); // host -> consecutive failed pings count

    targets.forEach((target, index) => {
      // Trim target
      const host = target.trim();
      if (!host) return;

      // Stagger Globalping queries by 1.5 seconds each to respect rate limits
      const gpTimeout = setTimeout(() => {
        if (activeJobs.has(socket.id)) {
          triggerGlobalping(host, socket);
        }
      }, index * 1500);
      jobs.push(gpTimeout);

      // Resolve IP and BGP/ISP Info (staggered by 100ms to prevent thread pool exhaustion and API rate limits)
      const lookupTimeout = setTimeout(() => {
        let host = target.trim();
        if (host.includes('@')) {
          host = host.split('@')[0].trim();
        }
        if (!host) return;

        if (net.isIP(host)) {
          dns.reverse(host, (err, hostnames) => {
            if (!err && hostnames && hostnames.length > 0) {
              socket.emit('resolved-hostname', { target, hostname: hostnames[0] });
            }
          });

          getIpInfo(host, (err, info) => {
            if (!err && info) {
              socket.emit('ip-info', { target, as: info.as, isp: info.isp });
            }
          });
        } else {
          dns.lookup(host, (err, address) => {
            if (!err && address) {
              socket.emit('resolved-ip', { target, ip: address });
              
              getIpInfo(address, (err, info) => {
                if (!err && info) {
                  socket.emit('ip-info', { target, as: info.as, isp: info.isp });
                }
              });
            }
          });
        }
      }, index * 100);
      jobs.push(lookupTimeout);
    });

    let sshConn = null;
    let isStopping = false;

    const startPingLoop = () => {
      const activeTargets = new Set(targets.map(t => t.trim()).filter(t => t.length > 0));
      const MAX_CONCURRENCY = executionSource === 'router' ? 5 : 15; // Lower concurrency for remote routers

      const runPingRound = async () => {
        if (isStopping) return;
        const startTime = Date.now();

        // Only queue targets that are still active (online)
        const queue = Array.from(activeTargets);

        const worker = async () => {
          while (queue.length > 0 && !isStopping) {
            const target = queue.shift();
            if (!target) continue;

            let host = target.trim();
            let source = sourceIP;
            if (host.includes('@')) {
              const parts = host.split('@');
              host = parts[0].trim();
              source = parts[1].trim();
            }
            if (!host || !activeTargets.has(target)) continue;

            await new Promise((resolve) => {
              if (executionSource === 'router' && routerSshConn === 'plink') {
                const activeShell = globalPlinkShells.get(socket.plinkConfig.host);
                if (activeShell && activeShell.hasTracerouteActive()) {
                  resolve();
                  return;
                }
              }

              const pingFn = executionSource === 'router'
                ? (routerSshConn === 'plink'
                    ? (h, src, cb) => pingHostRemotePlink(socket.plinkConfig, connectedRouterType, h, cb, src, socket.id)
                    : (h, src, cb) => pingHostRemote(routerSshConn, connectedRouterType, h, cb, src, routerSshNeedsPty))
                : (pingMode === 'tcp'
                  ? (h, src, cb) => pingHostTcp(h, tcpPort, src, cb)
                  : (pingMode === 'udp'
                    ? (h, src, cb) => pingHostUdp(h, tcpPort, src, cb)
                    : (h, src, cb) => pingHost(h, src, cb)));

              let isFallback = fallbackParentMap.has(target);
              let parent = fallbackParentMap.get(target);

              pingFn(host, source, (err, result) => {
                const active = activeJobs.has(socket.id);
                if (active && !isStopping) {
                  if (err || result.status === 'offline') {
                    if (!isFallback) {
                      const currentLosses = (consecutiveLosses.get(target) || 0) + 1;
                      consecutiveLosses.set(target, currentLosses);
                    }

                    socket.emit('ping-result', {
                      target: target,
                      isFallbackFor: parent,
                      status: 'offline',
                      error: err ? err.message : (result.error || 'Offline'),
                      timestamp: Date.now(),
                      via: executionSource === 'router' ? `${(routerConfig && routerConfig.host) || ''}${source ? ' src ' + source : ''}` : null
                    });

                    if (!isFallback && !parentToFallbackMap.has(target) && !searchingTargets.has(target)) {
                      const losses = consecutiveLosses.get(target) || 0;
                      if (losses >= 10) {
                        searchingTargets.add(target);

                        const resolveAndSearch = (ipToSearch) => {
                          console.log(`Target ${target} (${ipToSearch}) has failed 10 times consecutively. Searching for a nearby pingable IP...`);
                          if (executionSource === 'router' && routerSshConn === 'plink') {
                            const activeShell = globalPlinkShells.get(socket.plinkConfig.host);
                            if (activeShell && activeShell.hasTracerouteActive()) {
                              cb(null, { status: 'offline', error: 'Traceroute active', raw: 'Ping skipped' });
                              return;
                            }
                          }

                          const customPingFn = executionSource === 'router'
                            ? (routerSshConn === 'plink'
                                ? (h, src, cb) => pingHostRemotePlink(socket.plinkConfig, connectedRouterType, h, cb, src, socket.id)
                                : (h, src, cb) => pingHostRemote(routerSshConn, connectedRouterType, h, cb, src, routerSshNeedsPty))
                            : null;
                          findNearbyPingableIp(ipToSearch, source, pingMode, tcpPort, (searchErr, fallbackIp) => {
                            searchingTargets.delete(target);
                            if (fallbackIp) {
                              const newTarget = `${fallbackIp}@${source}`;
                              if (!activeTargets.has(newTarget)) {
                                console.log(`Found nearby pingable IP for ${target}: ${fallbackIp}. Adding to monitoring.`);
                                
                                fallbackParentMap.set(newTarget, target);
                                parentToFallbackMap.set(target, newTarget);
                                
                                activeTargets.add(newTarget);
                                
                                socket.emit('fallback-ip-found', { target: target, fallbackIp });
                              }
                            } else {
                              console.log(`No pingable IP found in /24 subnet for ${target}.`);
                              socket.emit('fallback-ip-not-found', { target: target });
                            }
                          }, customPingFn);
                        };

                        if (net.isIP(host)) {
                          resolveAndSearch(host);
                        } else {
                          dns.lookup(host, (dnsErr, address) => {
                            if (!dnsErr && address) {
                              resolveAndSearch(address);
                            } else {
                              searchingTargets.delete(target);
                            }
                          });
                        }
                      }
                    }
                  } else {
                    if (!isFallback) {
                      consecutiveLosses.delete(target);
                    }

                    socket.emit('ping-result', {
                      target: target,
                      isFallbackFor: parent,
                      status: result.status,
                      latency: result.latency,
                      error: result.error,
                      raw: result.raw,
                      timestamp: Date.now(),
                      via: executionSource === 'router' ? `${(routerConfig && routerConfig.host) || ''}${source ? ' src ' + source : ''}` : null
                    });
                  }
                }
                resolve();
              });
            });
          }
        };

        // Spawn workers
        const workers = [];
        for (let i = 0; i < Math.min(MAX_CONCURRENCY, queue.length); i++) {
          workers.push(worker());
        }

        await Promise.all(workers);

        // Schedule next round
        const duration = Date.now() - startTime;
        const delay = Math.max(interval - duration, 100);

        if (!isStopping && activeTargets.size > 0) {
          const timeoutId = setTimeout(runPingRound, delay);
          jobs.push({
            stop: () => { clearTimeout(timeoutId); }
          });
        }
      };

      socket.on('add-targets', (data) => {
        const { targets: newTargets } = data;
        if (!Array.isArray(newTargets)) return;

        newTargets.forEach((target, index) => {
          const host = target.trim();
          if (!host) return;

          if (!activeTargets.has(host)) {
            activeTargets.add(host);
            console.log(`Dynamically added target to session: ${host}`);

            // Trigger Globalping staggered
            const gpTimeout = setTimeout(() => {
              if (activeJobs.has(socket.id)) {
                triggerGlobalping(host, socket);
              }
            }, index * 1500);
            jobs.push(gpTimeout);

            // Resolve DNS details staggered
            const lookupTimeout = setTimeout(() => {
              if (net.isIP(host)) {
                dns.reverse(host, (err, hostnames) => {
                  if (!err && hostnames && hostnames.length > 0) {
                    socket.emit('resolved-hostname', { target: host, hostname: hostnames[0] });
                  }
                });
                getIpInfo(host, (err, info) => {
                  if (!err && info) {
                    socket.emit('ip-info', { target: host, as: info.as, isp: info.isp });
                  }
                });
              } else {
                dns.lookup(host, (dnsErr, address) => {
                  if (!dnsErr && address) {
                    socket.emit('resolved-ip', { target: host, ip: address });
                    getIpInfo(address, (err, info) => {
                      if (!err && info) {
                        socket.emit('ip-info', { target: host, as: info.as, isp: info.isp });
                      }
                    });
                  }
                });
              }
            }, index * 100);
            jobs.push(lookupTimeout);
          }
        });
      });

      runPingRound();
    };

    if (executionSource === 'router') {
      if (!routerSshConn) {
        socket.emit('console-log', { text: `Error: Router is not connected. Please log in first.`, type: 'failure' });
        socket.emit('monitoring-stopped');
        return;
      }

      jobs.push({
        stop: () => {
          isStopping = true;
        }
      });

      socket.emit('console-log', { text: `Connected to router. Starting ping loop...`, type: 'success' });
      startPingLoop();
    } else {
      jobs.push({
        stop: () => { isStopping = true; }
      });
      startPingLoop();
    }

    activeJobs.set(socket.id, jobs);
    socket.emit('monitoring-started');
  });

  // Handle stop monitoring request
  socket.on('stop-monitoring', () => {
    stopJobsForSocket(socket.id);
    stopAllBackgroundMtrs();
    socket.removeAllListeners('add-targets');
    socket.emit('monitoring-stopped');
  });

  // Handle single ping check request (Check Once - 5 pings)
  socket.on('check-once', async (config) => {
    const { targets, sourceIP, pingMode, tcpPort, executionSource, routerConfig } = config;
    const resolvedSourceIp = sourceIP || '';
    console.log(`Starting 5-ping check for ${targets.length} targets using mode ${pingMode || 'icmp'} (source: ${executionSource || 'local'}) from socket ${socket.id}`);

    if (executionSource === 'router') {
      if (!routerSshConn) {
        socket.emit('console-log', { text: `Error: Router is not connected. Please log in first.`, type: 'failure' });
        socket.emit('check-once-complete');
        return;
      }

      socket.emit('console-log', { text: `Running 5-ping check via connected router...`, type: 'success' });
      
      const promises = targets.map((target, targetIndex) => {
        return new Promise((resolve) => {
          const host = target.trim();
          if (!host) return resolve();

          // Resolve IP & BGP Details staggered
          setTimeout(() => {
            dns.lookup(host, (err, address) => {
              if (!err && address) {
                socket.emit('resolved-ip', { target: host, ip: address });
                getIpInfo(address, (err, info) => {
                  if (!err && info) {
                    socket.emit('ip-info', { target: host, as: info.as, isp: info.isp });
                  }
                });
              }
            });
          }, targetIndex * 100);

          // Run 5 remote pings staggered
          setTimeout(async () => {
            const source = resolvedSourceIp || (routerConfig && routerConfig.host);
            for (let i = 0; i < 5; i++) {
              if (i > 0) {
                await new Promise(r => setTimeout(r, 1000));
              }

              await new Promise((resolvePing) => {
                const checkPingFn = routerSshConn === 'plink'
                  ? (h, src, cb) => pingHostRemotePlink(socket.plinkConfig, connectedRouterType, h, cb, src, socket.id)
                  : (h, src, cb) => pingHostRemote(routerSshConn, connectedRouterType, h, cb, src, routerSshNeedsPty);

                checkPingFn(host, source, (err, result) => {
                  if (err || result.status === 'offline') {
                    socket.emit('ping-result', {
                      target: host,
                      status: 'offline',
                      error: err ? err.message : (result.error || 'Offline'),
                      timestamp: Date.now(),
                      via: executionSource === 'router' ? `${(routerConfig && routerConfig.host) || ''}${source ? ' src ' + source : ''}` : null
                    });
                  } else {
                    socket.emit('ping-result', {
                      target: host,
                      status: result.status,
                      latency: result.latency,
                      error: result.error,
                      raw: result.raw,
                      timestamp: Date.now(),
                      via: executionSource === 'router' ? `${(routerConfig && routerConfig.host) || ''}${source ? ' src ' + source : ''}` : null
                    });
                  }
                  resolvePing();
                });
              });
            }
            resolve();
          }, targetIndex * 50);
        });
      });

      await Promise.all(promises);
      socket.emit('check-once-complete');
    } else {
      // Local Check Once
      const promises = targets.map((target, targetIndex) => {
        return new Promise((resolve) => {
          const host = target.trim();
          if (!host) return resolve();

          // 1. Resolve IP & BGP Details (staggered by 100ms)
          setTimeout(() => {
            dns.lookup(host, (err, address) => {
              if (!err && address) {
                socket.emit('resolved-ip', { target: host, ip: address });
                getIpInfo(address, (err, info) => {
                  if (!err && info) {
                    socket.emit('ip-info', { target: host, as: info.as, isp: info.isp });
                  }
                });
              }
            });
          }, targetIndex * 100);

          // Stagger the start of this target's 5-ping loop by targetIndex * 50ms to prevent CPU spikes
          setTimeout(async () => {
            for (let i = 0; i < 5; i++) {
              if (i > 0) {
                await new Promise(r => setTimeout(r, 1000));
              }

              await new Promise((resolvePing) => {
                const pingFn = pingMode === 'tcp'
                  ? (host, ip, cb) => pingHostTcp(host, tcpPort, ip, cb)
                  : (pingMode === 'udp'
                    ? (host, ip, cb) => pingHostUdp(host, tcpPort, ip, cb)
                    : (host, ip, cb) => pingHost(host, ip, cb));

                pingFn(host, sourceIP, (err, result) => {
                  if (err || result.status === 'offline') {
                    socket.emit('ping-result', {
                      target: host,
                      status: 'offline',
                      error: err ? err.message : (result.error || 'Offline'),
                      timestamp: Date.now()
                    });
                  } else {
                    socket.emit('ping-result', {
                      target: host,
                      status: result.status,
                      latency: result.latency,
                      error: result.error,
                      raw: result.raw,
                      timestamp: Date.now()
                    });
                  }
                  resolvePing();
                });
              });
            }
            resolve();
          }, targetIndex * 50);
        });
      });

      await Promise.all(promises);
      socket.emit('check-once-complete');
    }
  });

  // Handle traceroute request
  socket.on('start-traceroute', (data) => {
    const { target, mode, port, routerConfig, localSource } = data;
    let host = target.trim();
    let sourceIp = '';

    if (host.includes('@')) {
      const parts = host.split('@');
      host = parts[0].trim();
      sourceIp = parts[1].trim();
    }

    if (!host) {
      socket.emit('traceroute-error', 'Invalid target');
      return;
    }

    // Kill any existing traceroute for this socket
    if (activeTraceroutes.has(socket.id)) {
      const oldChild = activeTraceroutes.get(socket.id);
      try { oldChild.kill(); } catch (e) {}
    }

    if (routerConfig && routerConfig.host) {
      const activeShell = globalPlinkShells.get(routerConfig.host);
      if (activeShell && activeShell.isReady) {
        const src = sourceIp || (routerConfig && routerConfig.source) || (socket.plinkConfig && socket.plinkConfig.source);
        const rType = (routerConfig && routerConfig.type) || connectedRouterType;
        let cmd = '';
        if (rType === 'mikrotik') {
          cmd = `/tool traceroute address=${host} use-dns=no count=10${src ? ' src-address=' + src : ''}`;
        } else if (rType === 'cisco') {
          cmd = `traceroute ${host} numeric${src ? ' source ' + src : ''}`;
        } else if (rType === 'huawei') {
          cmd = `tracert ${src ? '-a ' + src + ' ' : ''}${host}`;
        } else {
          cmd = `traceroute -n ${src ? '-I ' + src + ' ' : ''}${host}`;
        }

        console.log(`[Diagnostic] Executing traceroute via persistent plink shell: "${cmd}"`);
        socket.emit('traceroute-line', `Executing: ${cmd}`);
        try {
          io.emit('router-tracing-status', { host: routerConfig.host, target: target, active: true });
        } catch (err) {}

        let buffer = '';
        activeShell.execCommand(cmd, 60000, (chunk) => {
          buffer += chunk;
          let boundary = buffer.indexOf('\n');
          while (boundary !== -1) {
            const line = buffer.substring(0, boundary).replace(/\r$/, '');
            buffer = buffer.substring(boundary + 1);
            socket.emit('traceroute-line', line);
            boundary = buffer.indexOf('\n');
          }
        }, socket.id)
        .then((fullOutput) => {
          if (buffer.trim()) {
            socket.emit('traceroute-line', buffer.replace(/\r$/, ''));
          }
          socket.emit('traceroute-complete');
          try {
            io.emit('router-tracing-status', { host: routerConfig.host, target: target, active: false });
          } catch (err) {}
        })
        .catch((err) => {
          socket.emit('traceroute-error', err.message);
          try {
            io.emit('router-tracing-status', { host: routerConfig.host, target: target, active: false });
          } catch (err) {}
        });
      } else {
        socket.emit('traceroute-error', 'Router is not connected. Please log in first.');
        socket.emit('traceroute-log', 'Error: Router is not connected. Please log in first.\n');
      }
      return;
    }

    const src = sourceIp || localSource;
    console.log(`Starting local traceroute for ${host} from socket ${socket.id} (Mode: ${mode || 'icmp'}, Port: ${port || 80}, Source: ${src || 'default'})`);
    let child;
    if (mode === 'tcp') {
      const localTraceTcp = path.join(__dirname, 'tracetcp.exe');
      const tracetcpBin = fs.existsSync(localTraceTcp) ? localTraceTcp : 'tracetcp';
      const args = [`${host}:${port || 80}`, '-m', '30'];
      if (src) {
        args.push('-S', src);
      }
      child = spawn(tracetcpBin, args);
    } else {
      // Windows uses tracert with -d to disable domain lookup, and -S to specify source address
      const args = ['-d'];
      if (src) {
        args.push('-S', src);
      }
      args.push(host);
      child = spawn('tracert', args);
    }
    activeTraceroutes.set(socket.id, child);

    let buffer = '';
    child.stdout.on('data', (data) => {
      buffer += data.toString();
      let boundary = buffer.indexOf('\n');
      while (boundary !== -1) {
        const line = buffer.substring(0, boundary).replace(/\r$/, '');
        buffer = buffer.substring(boundary + 1);
        socket.emit('traceroute-line', line);
        boundary = buffer.indexOf('\n');
      }
    });

    let errBuffer = '';
    child.stderr.on('data', (data) => {
      errBuffer += data.toString();
      let boundary = errBuffer.indexOf('\n');
      while (boundary !== -1) {
        const line = errBuffer.substring(0, boundary).replace(/\r$/, '');
        errBuffer = errBuffer.substring(boundary + 1);
        socket.emit('traceroute-line', line);
        boundary = errBuffer.indexOf('\n');
      }
    });

    child.on('close', (code) => {
      // Flush any remaining buffered output
      if (buffer) {
        socket.emit('traceroute-line', buffer.replace(/\r$/, ''));
      }
      if (errBuffer) {
        socket.emit('traceroute-line', errBuffer.replace(/\r$/, ''));
      }
      activeTraceroutes.delete(socket.id);
      socket.emit('traceroute-complete');
    });

    child.on('error', (err) => {
      activeTraceroutes.delete(socket.id);
      socket.emit('traceroute-error', err.message);
    });
  });

  // Handle My Traceroute (MTR) request (subscribe/start on-demand)
  socket.on('start-mtr', (data) => {
    const { target, sourceIP, mode, port, routerConfig } = data;
    const host = target.trim();
    if (!host) {
      socket.emit('mtr-error', 'Invalid target');
      return;
    }

    console.log(`Socket ${socket.id} subscribing to MTR for ${host} (Mode: ${mode || 'icmp'}, Port: ${port || 80})`);

    let mtrConfig = routerConfig;
    if (socket.plinkConfig) {
      mtrConfig = socket.plinkConfig;
    } else if (routerSshConn && routerSshConn !== 'plink') {
      mtrConfig = Object.assign({}, routerConfig, { sshConn: routerSshConn, type: connectedRouterType, needsPty: routerSshNeedsPty });
    }

    let session = globalMtrs.get(host);
    if (!session) {
      console.log(`Starting MTR on-demand for ${host}`);
      session = startBackgroundMtr(host, sourceIP || '', mode, port, mtrConfig);
    }

    // Subscribe this socket
    if (session) {
      session.subscribers.add(socket.id);
    } else {
      socket.emit('mtr-error', 'Failed to start MTR session');
      return;
    }

    // 1. Immediately send currently discovered hops
    session.hops.forEach(hop => {
      socket.emit('mtr-hop-discovered', { hopNum: hop.hopNum, ip: hop.ip });
    });

    // 2. Immediately send accumulated stats (include IP)
    socket.emit('mtr-init-stats', session.hops.map(h => ({
      hopNum: h.hopNum,
      ip: h.ip,
      sent: h.sent,
      received: h.received,
      lost: h.lost,
      last: h.last,
      best: h.best,
      worst: h.worst,
      totalLatency: h.totalLatency
    })));

    // 3. If route discovery is already complete, notify client
    if (session.routeComplete) {
      socket.emit('mtr-route-complete');
    }
  });

  // Handle unsubscribing from MTR
  socket.on('stop-mtr', (data) => {
    const { target } = data;
    const host = target.trim();
    if (!host) return;

    const session = globalMtrs.get(host);
    if (session) {
      session.subscribers.delete(socket.id);
      console.log(`Socket ${socket.id} unsubscribed from MTR for ${host}`);
      if (session.subscribers.size === 0) {
        console.log(`No subscribers left for MTR ${host}. Stopping MTR.`);
        stopMtrSession(host);
      }
    }
  });

  // Handle on-demand BD Best (Globalping) query
  socket.on('query-globalping', (data) => {
    const { target } = data;
    const host = target.trim();
    if (host) {
      console.log(`On-demand Globalping requested for ${host} from socket ${socket.id}`);
      triggerGlobalping(host, socket);
    }
  });

  // Handle My Traceroute (MTR) stats reset
  socket.on('reset-mtr-stats', (data) => {
    const { target } = data;
    const session = globalMtrs.get(target);
    if (session) {
      session.hops.forEach(h => {
        h.sent = 0;
        h.received = 0;
        h.lost = 0;
        h.last = null;
        h.best = null;
        h.worst = null;
        h.totalLatency = 0;
      });
    }
  });

  // Handle start port scan request
  socket.on('start-port-scan', async (data) => {
    const { target, preset, startPort, endPort } = data;
    const host = target.trim();
    if (!host) {
      socket.emit('port-scan-error', 'Invalid target');
      return;
    }

    // Cancel any existing scan for this socket
    if (activePortScans.has(socket.id)) {
      activePortScans.get(socket.id)();
    }

    // Determine the list of ports to scan
    let portsToScan = [];
    if (preset === 'common') {
      portsToScan = Object.keys(PORT_SERVICES).map(Number);
    } else if (preset === 'specific') {
      portsToScan = [Math.max(1, Math.min(65535, startPort))];
    } else if (preset === 'web') {
      portsToScan = [80, 443, 8000, 8080, 8443];
    } else if (preset === 'db') {
      portsToScan = [1433, 1521, 3306, 5432, 6379, 27017];
    } else if (preset === 'custom') {
      const start = Math.max(1, Math.min(65535, startPort));
      const end = Math.max(1, Math.min(65535, endPort));
      const s = Math.min(start, end);
      const e = Math.max(start, end);
      for (let p = s; p <= e; p++) {
        portsToScan.push(p);
      }
    }

    if (portsToScan.length === 0) {
      socket.emit('port-scan-error', 'No ports to scan');
      return;
    }

    console.log(`Starting port scan on ${host} for ${portsToScan.length} ports from socket ${socket.id}`);

    let isCancelled = false;
    activePortScans.set(socket.id, () => {
      isCancelled = true;
    });

    const total = portsToScan.length;
    let scanned = 0;
    const CONCURRENCY = 30; // Scan 30 ports in parallel

    const scanQueue = [...portsToScan];
    
    const worker = async () => {
      while (scanQueue.length > 0 && !isCancelled) {
        const port = scanQueue.shift();
        if (port === undefined) break;

        socket.emit('port-scan-progress', {
          scanned,
          total,
          currentPort: port
        });

        const result = await checkPort(host, port);
        if (isCancelled) break;

        scanned++;
        socket.emit('port-scan-result', {
          port: result.port,
          service: getPortService(result.port),
          status: result.status,
          response: result.status === 'open' ? 'Connection established' : (result.status === 'filtered' ? 'Timeout' : 'Refused')
        });
      }
    };

    // Spawn workers
    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, scanQueue.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    if (!isCancelled) {
      socket.emit('port-scan-progress', { scanned: total, total });
      socket.emit('port-scan-complete');
    }
    activePortScans.delete(socket.id);
  });

  // Handle stop port scan request
  socket.on('stop-port-scan', () => {
    if (activePortScans.has(socket.id)) {
      activePortScans.get(socket.id)();
      activePortScans.delete(socket.id);
    }
  });

  let routerSshConn = null;
  let connectedRouterType = null;
  let routerSshNeedsPty = false;

  socket.on('router-connect', async (config) => {
    let { type, host, port, username, password, usePlink, plinkSession, plinkPath } = config;
    
    if (type === 'huawei' || type === 'cisco') {
      usePlink = true;
      plinkPath = plinkPath || 'plink.exe';
      config.usePlink = true;
      config.plinkPath = plinkPath;
    }

    connectedRouterType = type;
    routerSshNeedsPty = false;

    if (usePlink) {
      console.log(`[Diagnostic] Connecting to router via PuTTY Link (plink) persistent shell...`);
      let shell = globalPlinkShells.get(host);
      if (shell) {
        shell.close();
      }
      shell = new InteractivePlinkShell(config);
      globalPlinkShells.set(host, shell);
      
      socket.plinkShell = shell;
      config.plinkShell = shell;
      socket.plinkConfig = config;
      routerSshConn = 'plink';
      
      try {
        await shell.start();
        console.log(`[Diagnostic] Plink persistent shell ready. Executing terminal length adjustment...`);
        if (type === 'huawei') {
          await shell.execCommand('screen-length 0 temporary');
        } else if (type === 'cisco') {
          await shell.execCommand('terminal length 0');
        }

        const discoveryCmd = type === 'mikrotik' ? '/ip address print' 
                           : type === 'cisco' ? 'show ip interface brief'
                           : type === 'huawei' ? 'display ip interface brief'
                           : 'ip addr show';

        console.log(`[Diagnostic] Executing discovery command: "${discoveryCmd}"`);
        const output = await socket.plinkShell.execCommand(discoveryCmd);
        console.log(`[Diagnostic] Plink shell discovery output:\n`, output);
        const cleanOutput = stripAnsi(output);
        const ips = [];
        const lines = cleanOutput.split('\n');

        lines.forEach(line => {
          const cleanLine = line.trim();
          if (!cleanLine) return;

          if (type === 'mikrotik') {
            const ipMatch = cleanLine.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d+)/);
            if (ipMatch) {
              const ip = ipMatch[1];
              const tokens = cleanLine.split(/\s+/);
              const iface = tokens[tokens.length - 1];
              ips.push({ interface: iface, ip, isPrivate: isPrivateIp(ip) });
            }
          } else if (type === 'cisco') {
            const tokens = cleanLine.split(/\s+/);
            if (tokens.length >= 2 && net.isIP(tokens[1])) {
              const iface = tokens[0];
              const ip = tokens[1];
              ips.push({ interface: iface, ip, isPrivate: isPrivateIp(ip) });
            }
          } else if (type === 'huawei') {
            const tokens = cleanLine.split(/\s+/);
            if (tokens.length >= 2) {
              const iface = tokens[0];
              const ipWithMask = tokens[1];
              const ipOnly = ipWithMask.split('/')[0];
              if (net.isIP(ipOnly)) {
                ips.push({ interface: iface, ip: ipOnly, isPrivate: isPrivateIp(ipOnly) });
              }
            }
          }
        });

        if (ips.length > 0) {
          const hostname = shell.getHostname();
          socket.emit('router-connected', { ips, usePlink: true, hostname });
        } else {
          socket.emit('router-connect-error', { 
            message: `Plink connected, but failed to retrieve any network interfaces. Verify that you selected the correct Router Brand and the session has permissions.` 
          });
          if (socket.plinkShell) {
            socket.plinkShell.close();
            socket.plinkShell = null;
          }
          globalPlinkShells.delete(host);
          routerSshConn = null;
        }
      } catch (err) {
        console.error(`[Diagnostic] Plink Connection Failed:`, err.message);
        socket.emit('router-connect-error', { message: `PuTTY Link (plink) Failed: ${err.message}` });
        if (socket.plinkShell) {
          socket.plinkShell.close();
          socket.plinkShell = null;
        }
        globalPlinkShells.delete(host);
        routerSshConn = null;
      }
      return;
    }

    const { Client } = require('ssh2');
    let hasErrored = false;
    let retryCount = 0;

    const startSshConnection = () => {
      routerSshConn = new Client();

      routerSshConn.on('error', (err) => {
        console.error(`[Diagnostic] SSH Connection Error (Attempt ${retryCount + 1}):`, err.message);
        if (retryCount === 0) {
          retryCount++;
          console.log(`[Diagnostic] Retrying SSH connection with password option enabled...`);
          try { routerSshConn.end(); } catch(e) {}
          startSshConnection();
          return;
        }

        if (hasErrored) return;
        hasErrored = true;
        let msg = `SSH Connection Failed: ${err.message}`;
        if (err.message.includes('Authentication failed') || err.message.includes('authentication methods failed')) {
          msg = `SSH Login Failed: Incorrect username or password.`;
        } else if (err.code === 'ECONNREFUSED') {
          msg = `SSH Connection Failed: Connection refused on port ${port}.`;
        }
        socket.emit('router-connect-error', { message: msg });
      });

      routerSshConn.on('keyboard-interactive', getKeyboardInteractiveHandler(password));

      routerSshConn.on('ready', () => {
        let cmd = '';
        if (type === 'mikrotik') {
          cmd = '/ip address print';
        } else if (type === 'cisco') {
          cmd = 'terminal length 0\nshow ip interface brief';
        } else if (type === 'huawei') {
          cmd = 'screen-length 0 temporary\ndisplay ip interface brief';
        } else {
          cmd = 'ip addr show';
        }

        const runDiscovery = (usePty = false) => {
          const execOptions = usePty ? { pty: true } : {};
          routerSshConn.exec(cmd, execOptions, (err, stream) => {
            if (err) {
              if (!usePty) {
                runDiscovery(true);
              } else {
                if (hasErrored) return;
                hasErrored = true;
                socket.emit('router-connect-error', { message: `Failed to run IP discovery: ${err.message}` });
              }
              return;
            }

            let output = '';
            stream.on('data', (d) => { output += d.toString(); });
            stream.on('close', () => {
              if (hasErrored) return;

              const cleanOutput = stripAnsi(output);
              const ips = [];
              const lines = cleanOutput.split('\n');

              lines.forEach(line => {
                const cleanLine = line.trim();
                if (!cleanLine) return;

                if (type === 'mikrotik') {
                  const ipMatch = cleanLine.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d+)/);
                  if (ipMatch) {
                    const ip = ipMatch[1];
                    const tokens = cleanLine.split(/\s+/);
                    const iface = tokens[tokens.length - 1];
                    ips.push({ interface: iface, ip, isPrivate: isPrivateIp(ip) });
                  }
                } else if (type === 'cisco') {
                  const tokens = cleanLine.split(/\s+/);
                  if (tokens.length >= 2 && net.isIP(tokens[1])) {
                    const iface = tokens[0];
                    const ip = tokens[1];
                    ips.push({ interface: iface, ip, isPrivate: isPrivateIp(ip) });
                  }
                } else if (type === 'huawei') {
                  const tokens = cleanLine.split(/\s+/);
                  if (tokens.length >= 2) {
                    const iface = tokens[0];
                    const ipWithMask = tokens[1];
                    const ipOnly = ipWithMask.split('/')[0];
                    if (net.isIP(ipOnly)) {
                      ips.push({ interface: iface, ip: ipOnly, isPrivate: isPrivateIp(ipOnly) });
                    }
                  }
                }
              });

              if (ips.length > 0) {
                routerSshNeedsPty = usePty;
                socket.emit('router-connected', { 
                  ips, 
                  needsPty: usePty, 
                  needsPasswordOption: retryCount > 0,
                  hostname: type.toUpperCase()
                });
              } else if (!usePty) {
                runDiscovery(true);
              } else {
                hasErrored = true;
                socket.emit('router-connect-error', { 
                  message: `SSH connection succeeded, but failed to retrieve any network interfaces. Please check that you selected the correct Router Brand and the user has permission to run '${cmd}'.` 
                });
                try { routerSshConn.end(); } catch (e) {}
                routerSshConn = null;
              }
            });
          });
        };

        runDiscovery(false);
      });

      const connOptions = {
        host,
        port: port || 22,
        username,
        readyTimeout: 60000,
        tryKeyboard: true
      };
      if (retryCount > 0) {
        connOptions.password = password;
      }
      routerSshConn.connect(connOptions);
    };

    startSshConnection();
  });

  socket.on('router-disconnect', () => {
    const host = socket.plinkConfig && socket.plinkConfig.host;
    if (host) {
      const shell = globalPlinkShells.get(host);
      if (shell) {
        console.log(`[Diagnostic] Closing plink persistent shell for ${host}...`);
        shell.close();
        globalPlinkShells.delete(host);
      }
    }
    if (socket.plinkShell) {
      socket.plinkShell.close();
      socket.plinkShell = null;
    }
    if (routerSshConn) {
      if (routerSshConn !== 'plink') {
        try { routerSshConn.end(); } catch(e) {}
      }
      routerSshConn = null;
    }
  });

  socket.on('router-action', (data) => {
    const { action, target, sourceIp } = data;
    if (!routerSshConn) {
      socket.emit('router-log', { text: `[System Error] Not connected to router.`, isError: true });
      socket.emit('router-action-complete');
      return;
    }

    let cmd = '';
    if (action === 'ping') {
      if (connectedRouterType === 'mikrotik') {
        cmd = `/ping address=${target} count=5${sourceIp ? ' src-address=' + sourceIp : ''}`;
      } else if (connectedRouterType === 'cisco') {
        cmd = `ping ${target} repeat 5${sourceIp ? ' source ' + sourceIp : ''}`;
      } else if (connectedRouterType === 'huawei') {
        cmd = `ping ${sourceIp ? '-a ' + sourceIp : ''} -c 5 ${target}`;
      } else {
        cmd = `ping -c 5 ${sourceIp ? '-I ' + sourceIp : ''} ${target}`;
      }
    } else if (action === 'traceroute') {
      if (connectedRouterType === 'mikrotik') {
        cmd = `/tool traceroute address=${target} use-dns=no count=1${sourceIp ? ' src-address=' + sourceIp : ''}`;
      } else if (connectedRouterType === 'cisco') {
        cmd = `traceroute ${target} numeric${sourceIp ? ' source ' + sourceIp : ''}`;
      } else if (connectedRouterType === 'huawei') {
        cmd = `tracert ${sourceIp ? '-a ' + sourceIp + ' ' : ''}${target}`;
      } else {
        cmd = `traceroute -n ${sourceIp ? '-I ' + sourceIp + ' ' : ''}${target}`;
      }
    }

    const cleanTarget = target.replace(/[^a-zA-Z0-9\.\-]/g, '');
    const finalCmd = cmd.replace(target, cleanTarget);

    if (routerSshConn === 'plink') {
      const host = socket.plinkConfig && socket.plinkConfig.host;
      const shell = globalPlinkShells.get(host);
      if (shell && shell.isReady) {
        shell.execCommand(finalCmd, 60000, (chunk) => {
          socket.emit('router-log', { text: chunk });
        })
        .then(output => {
          socket.emit('router-action-complete');
        })
        .catch(err => {
          socket.emit('router-log', { text: `Plink Execution Error: ${err.message}`, isError: true });
          socket.emit('router-action-complete');
        });
      } else {
        socket.emit('router-log', { text: `Error: Router is not connected. Please log in first.`, isError: true });
        socket.emit('router-action-complete');
      }
      return;
    }

    const execOptions = routerSshNeedsPty ? { pty: true } : {};
    routerSshConn.exec(finalCmd, execOptions, (err, stream) => {
      if (err) {
        socket.emit('router-log', { text: `Execution Error: ${err.message}` });
        socket.emit('router-action-complete');
        return;
      }

      stream.on('data', (d) => {
        socket.emit('router-log', { text: d.toString() });
      });

      stream.stderr.on('data', (d) => {
        socket.emit('router-log', { text: d.toString() });
      });

      stream.on('close', () => {
        socket.emit('router-action-complete');
      });
    });
  });

  socket.on('disconnect', () => {
    // Keep the shell open across page refreshes for better UX.
    // It will be closed on manual router-disconnect or server termination.
    if (routerSshConn) {
      if (routerSshConn !== 'plink') {
        try { routerSshConn.end(); } catch (e) {}
      }
    }
    connectedClients.delete(socket.id);
    console.log(`Client disconnected: ${socket.id}. Remaining connected: ${connectedClients.size}`);


    stopJobsForSocket(socket.id);
    globalPlinkShells.forEach((shell) => {
      shell.cancelJobsForSocket(socket.id);
    });
    socket.removeAllListeners('add-targets');

    if (activePortScans.has(socket.id)) {
      activePortScans.get(socket.id)();
      activePortScans.delete(socket.id);
    }
    
    // Unsubscribe from all MTR sessions
    globalMtrs.forEach((session, host) => {
      session.subscribers.delete(socket.id);
      if (session.subscribers.size === 0) {
        console.log(`No subscribers left for MTR ${host}. Stopping MTR.`);
        stopMtrSession(host);
      }
    });
  });
});

function startBackgroundMtr(target, sourceIP, mode = 'icmp', port = 80, routerConfig) {
  if (globalMtrs.has(target)) return globalMtrs.get(target);

  console.log(`Starting MTR on-demand for ${target} (Mode: ${mode}, Port: ${port})`);

  const mtrSession = {
    target,
    resolvedIp: null,
    tracerouteProcess: null,
    pingInterval: null,
    hops: [],
    subscribers: new Set(),
    routeComplete: false,
    startTimeout: null
  };
  globalMtrs.set(target, mtrSession);

  // Resolve target IP to match against hop IPs
  if (net.isIP(target)) {
    mtrSession.resolvedIp = target;
  } else {
    dns.lookup(target, (err, address) => {
      if (!err && address) {
        mtrSession.resolvedIp = address;
      }
    });
  }

  let child;
  let useTraceTcp = (mode === 'tcp');

  if (routerConfig && routerConfig.host) {
    if (routerConfig.type === 'huawei' || routerConfig.type === 'cisco') {
      routerConfig.usePlink = true;
      routerConfig.plinkPath = 'plink.exe';
    }
    let cmd = '';
    const src = routerConfig.source;
    if (routerConfig.type === 'mikrotik') {
      cmd = `/tool traceroute address=${target} use-dns=no count=1 max-hops=30${src ? ' src-address=' + src : ''}`;
    } else if (routerConfig.type === 'cisco') {
      cmd = `traceroute ${target} numeric ttl 1 30${src ? ' source ' + src : ''}`;
    } else if (routerConfig.type === 'huawei') {
      cmd = `tracert -m 30 ${src ? '-a ' + src + ' ' : ''}${target}`;
    } else {
      cmd = `traceroute -n -m 30 ${src ? '-I ' + src + ' ' : ''}${target}`;
    }

    if (routerConfig.usePlink) {
      const activeShell = globalPlinkShells.get(routerConfig.host);
      if (activeShell && activeShell.isReady) {
        console.log(`Starting MTR remote traceroute via persistent plink shell for ${target}`);
        let buffer = '';
        
        const processChunk = (chunk) => {
          buffer += chunk.toString();
          let boundary = buffer.indexOf('\n');
          while (boundary !== -1) {
            const line = buffer.substring(0, boundary).replace(/\r$/, '');
            buffer = buffer.substring(boundary + 1);

            const tokens = line.trim().split(/\s+/);
            const hopNum = parseInt(tokens[0], 10);
            if (!isNaN(hopNum)) {
              let ip = '???';
              const ipMatch = line.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
              if (ipMatch) {
                ip = ipMatch[0];
              } else if (line.includes('Request timed out') || line.includes('*')) {
                ip = 'Request timed out';
              }

              if (ip !== '???' && !mtrSession.hops.some(h => h.hopNum === hopNum)) {
                const newHop = {
                  hopNum,
                  ip,
                  sent: 0,
                  received: 0,
                  lost: 0,
                  last: null,
                  best: null,
                  worst: null,
                  totalLatency: 0,
                  consecutiveFailures: 0
                };
                mtrSession.hops.push(newHop);

                mtrSession.subscribers.forEach(socketId => {
                  io.to(socketId).emit('mtr-hop-discovered', { hopNum, ip });
                });

                // Abort traceroute early if we reached the target destination IP!
                const targetIp = target.trim();
                if (ip === targetIp) {
                  console.log(`[MTR] Traceroute reached destination ${targetIp} at hop ${hopNum}. Aborting traceroute early.`);
                  if (activeShell && activeShell.currentJob && activeShell.currentJob.cmd === cmd) {
                    activeShell.abortCurrentJob('Reached destination');
                  }
                }
              }
            }
            boundary = buffer.indexOf('\n');
          }
        };

        mtrSession.tracerouteProcess = {
          kill: () => {
            // No process to kill
          }
        };

        const startPingSweeps = () => {
          if (mtrSession.pingInterval) return; // Already running

          // Append target IP as the final hop if it wasn't discovered during traceroute
          const targetIp = target.trim();
          let maxHopNum = 0;
          mtrSession.hops.forEach(h => {
            if (h.hopNum > maxHopNum) maxHopNum = h.hopNum;
          });

          const hasTarget = mtrSession.hops.some(h => h.ip === targetIp);
          if (!hasTarget) {
            const finalHopNum = maxHopNum + 1;
            const targetHop = {
              hopNum: finalHopNum,
              ip: targetIp,
              sent: 0,
              received: 0,
              lost: 0,
              last: null,
              best: null,
              worst: null,
              totalLatency: 0,
              consecutiveFailures: 0
            };
            mtrSession.hops.push(targetHop);
            mtrSession.subscribers.forEach(socketId => {
              io.to(socketId).emit('mtr-hop-discovered', { hopNum: finalHopNum, ip: targetIp });
            });
          }

          mtrSession.routeComplete = true;
          mtrSession.subscribers.forEach(socketId => {
            io.to(socketId).emit('mtr-route-complete');
          });

          if (!globalMtrs.has(target)) return;

          const source = routerConfig.source || routerConfig.host;
          mtrSession.sweepCount = 0;
          mtrSession.pingInterval = setInterval(() => {
            mtrSession.sweepCount++;
            mtrSession.hops.forEach((hop) => {
              if (hop.ip === 'Request timed out' || hop.ip === '???') {
                hop.sent++;
                hop.lost++;
                hop.last = null;
                mtrSession.subscribers.forEach(socketId => {
                  io.to(socketId).emit('mtr-ping-result', { hopNum: hop.hopNum, status: 'offline', latency: null });
                });
                return;
              }

              const shouldSkip = hop.consecutiveFailures >= 3 && (mtrSession.sweepCount % 10 !== 0);
              if (shouldSkip) {
                hop.sent++;
                hop.lost++;
                hop.last = null;
                mtrSession.subscribers.forEach(socketId => {
                  io.to(socketId).emit('mtr-ping-result', { hopNum: hop.hopNum, status: 'offline', latency: null });
                });
                return;
              }

              pingHostRemotePlink(routerConfig, routerConfig.type, hop.ip, (pingErr, result) => {
                if (!globalMtrs.has(target)) return;

                hop.sent++;
                if (pingErr || result.status === 'offline') {
                  hop.lost++;
                  hop.last = null;
                  hop.consecutiveFailures = (hop.consecutiveFailures || 0) + 1;
                  mtrSession.subscribers.forEach(socketId => {
                    io.to(socketId).emit('mtr-ping-result', { hopNum: hop.hopNum, status: 'offline', latency: null });
                  });
                } else {
                  hop.consecutiveFailures = 0;
                  hop.received++;
                  hop.last = result.latency;
                  if (hop.best === null || result.latency < hop.best) hop.best = result.latency;
                  if (hop.worst === null || result.latency > hop.worst) hop.worst = result.latency;
                  hop.totalLatency += result.latency;

                  const avg = Math.round(hop.totalLatency / hop.received);
                  const lossPercent = Math.round((hop.lost / hop.sent) * 100);

                  mtrSession.subscribers.forEach(socketId => {
                    io.to(socketId).emit('mtr-ping-result', {
                      hopNum: hop.hopNum,
                      status: 'online',
                      latency: result.latency,
                      best: hop.best,
                      worst: hop.worst,
                      avg,
                      lossPercent,
                      sent: hop.sent,
                      received: hop.received
                    });
                  });
                }
              }, source);
            });
          }, 2000);
        };

        activeShell.execCommand(cmd, 180000, processChunk, null, true)
          .then(() => {
            console.log(`[MTR] Traceroute completed for ${target}. Starting ping sweeps.`);
            startPingSweeps();
          })
          .catch(err => {
            console.warn(`[MTR] persistent shell exec traceroute failed or timed out for ${target}:`, err.message);
            // Fallback: Start ping sweeps using whatever hops were already discovered
            startPingSweeps();
          });
      } else {
        setTimeout(() => {
          mtrSession.subscribers.forEach(socketId => {
            io.to(socketId).emit('mtr-message', 'Router is not logged in.');
          });
          stopMtrSession(target);
        }, 100);
      }
      return mtrSession;
    }

    const { Client } = require('ssh2');
    const conn = new Client();
    mtrSession.sshConn = conn;

    conn.on('error', (err) => {
      console.error(`MTR SSH Connection Error for ${target}:`, err.message);
      mtrSession.subscribers.forEach(socketId => {
        io.to(socketId).emit('mtr-message', `SSH Error: ${err.message}`);
      });
      stopMtrSession(target);
    });

    conn.on('keyboard-interactive', getKeyboardInteractiveHandler(routerConfig.password));

    conn.on('ready', () => {
      const execOptions = routerConfig.needsPty ? { pty: true } : {};
      conn.exec(cmd, execOptions, (err, stream) => {
        if (err) {
          console.error('MTR remote traceroute exec error:', err.message);
          stopMtrSession(target);
          return;
        }

        let buffer = '';
        stream.on('data', (d) => {
          buffer += d.toString();
          let boundary = buffer.indexOf('\n');
          while (boundary !== -1) {
            const line = buffer.substring(0, boundary).replace(/\r$/, '');
            buffer = buffer.substring(boundary + 1);

            const tokens = line.trim().split(/\s+/);
            const hopNum = parseInt(tokens[0], 10);
            if (!isNaN(hopNum)) {
              let ip = '???';
              const ipMatch = line.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
              if (ipMatch) {
                ip = ipMatch[0];
              } else if (line.includes('Request timed out') || line.includes('*')) {
                ip = 'Request timed out';
              }

              if (ip !== '???' && !mtrSession.hops.some(h => h.hopNum === hopNum)) {
                const newHop = {
                  hopNum,
                  ip,
                  sent: 0,
                  received: 0,
                  lost: 0,
                  last: null,
                  best: null,
                  worst: null,
                  totalLatency: 0,
                  consecutiveFailures: 0
                };
                mtrSession.hops.push(newHop);

                mtrSession.subscribers.forEach(socketId => {
                  io.to(socketId).emit('mtr-hop-discovered', { hopNum, ip });
                });
              }
            }
            boundary = buffer.indexOf('\n');
          }
        });

        stream.on('close', () => {
          mtrSession.routeComplete = true;
          mtrSession.subscribers.forEach(socketId => {
            io.to(socketId).emit('mtr-route-complete');
          });

          if (!globalMtrs.has(target)) return;

          const source = routerConfig.source || routerConfig.host;
          mtrSession.sweepCount = 0;
          mtrSession.pingInterval = setInterval(() => {
            mtrSession.sweepCount++;
            mtrSession.hops.forEach((hop) => {
              if (hop.ip === 'Request timed out' || hop.ip === '???') {
                hop.sent++;
                hop.lost++;
                hop.last = null;
                mtrSession.subscribers.forEach(socketId => {
                  io.to(socketId).emit('mtr-ping-result', { hopNum: hop.hopNum, status: 'offline', latency: null });
                });
                return;
              }

              const shouldSkip = hop.consecutiveFailures >= 3 && (mtrSession.sweepCount % 10 !== 0);
              if (shouldSkip) {
                hop.sent++;
                hop.lost++;
                hop.last = null;
                mtrSession.subscribers.forEach(socketId => {
                  io.to(socketId).emit('mtr-ping-result', { hopNum: hop.hopNum, status: 'offline', latency: null });
                });
                return;
              }

              pingHostRemote(conn, routerConfig.type, hop.ip, (pingErr, result) => {
                if (!globalMtrs.has(target)) return;

                hop.sent++;
                if (pingErr || result.status === 'offline') {
                  hop.lost++;
                  hop.last = null;
                  hop.consecutiveFailures = (hop.consecutiveFailures || 0) + 1;
                  mtrSession.subscribers.forEach(socketId => {
                    io.to(socketId).emit('mtr-ping-result', { hopNum: hop.hopNum, status: 'offline', latency: null });
                  });
                } else {
                  hop.consecutiveFailures = 0;
                  const latency = result.latency;
                  hop.received++;
                  hop.last = latency;
                  hop.totalLatency += latency;
                  if (hop.best === null || latency < hop.best) hop.best = latency;
                  if (hop.worst === null || latency > hop.worst) hop.worst = latency;

                  mtrSession.subscribers.forEach(socketId => {
                    io.to(socketId).emit('mtr-ping-result', { hopNum: hop.hopNum, status: 'online', latency });
                  });
                }
              }, source, routerConfig.needsPty);
            });
          }, 2000);
        });
      });
    });

    const connOptions = {
      host: routerConfig.host,
      port: routerConfig.port || 22,
      username: routerConfig.username,
      readyTimeout: 60000,
      tryKeyboard: true
    };
    if (routerConfig.needsPasswordOption) {
      connOptions.password = routerConfig.password;
    }
    conn.connect(connOptions);
  } else {
    const startTracerouteProcess = () => {
      if (useTraceTcp) {
        const localTraceTcp = path.join(__dirname, 'tracetcp.exe');
        const tracetcpBin = fs.existsSync(localTraceTcp) ? localTraceTcp : 'tracetcp';
        console.log(`Spawning ${tracetcpBin} for ${target}:${port}`);
        child = spawn(tracetcpBin, [`${target}:${port}`, '-m', '20']);
      } else {
        console.log(`Spawning tracert (ICMP) for ${target}`);
        child = spawn('tracert', ['-d', '-h', '20', '-w', '1000', target]);
      }
      mtrSession.tracerouteProcess = child;

      let buffer = '';
      child.stdout.on('data', (data) => {
        buffer += data.toString();
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const line = buffer.substring(0, boundary).replace(/\r$/, '');
          buffer = buffer.substring(boundary + 1);

          const tokens = line.trim().split(/\s+/);
          const hopNum = parseInt(tokens[0], 10);
          if (!isNaN(hopNum)) {
            let ip = '???';
            const ipMatch = line.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
            if (ipMatch) {
              ip = ipMatch[0];
            } else if (line.includes('Request timed out') || line.includes('*')) {
              ip = 'Request timed out';
            }

            if (!mtrSession.hops.some(h => h.hopNum === hopNum)) {
              const newHop = {
                hopNum,
                ip,
                sent: 0,
                received: 0,
                lost: 0,
                last: null,
                best: null,
                worst: null,
                totalLatency: 0,
                consecutiveFailures: 0
              };
              mtrSession.hops.push(newHop);

              mtrSession.subscribers.forEach(socketId => {
                io.to(socketId).emit('mtr-hop-discovered', { hopNum, ip });
              });
            }
          }
          boundary = buffer.indexOf('\n');
        }
      });

      child.stderr.on('data', (data) => {
        const errMsg = data.toString().trim();
        console.error(`MTR Traceroute stderr: ${errMsg}`);
        mtrSession.subscribers.forEach(socketId => {
          io.to(socketId).emit('mtr-message', `Error: ${errMsg}`);
        });
      });

      child.on('error', (err) => {
        if (useTraceTcp && err.code === 'ENOENT') {
          console.warn('tracetcp not found. Falling back to standard tracert (ICMP).');
          mtrSession.subscribers.forEach(socketId => {
            io.to(socketId).emit('mtr-message', 'tracetcp not found on system. Falling back to standard tracert (ICMP).');
          });
          useTraceTcp = false;
          startTracerouteProcess();
        } else {
          console.error(`Traceroute error for MTR ${target}:`, err);
        }
      });

      child.on('close', () => {
        mtrSession.routeComplete = true;
        mtrSession.subscribers.forEach(socketId => {
          io.to(socketId).emit('mtr-route-complete');
        });

        if (!globalMtrs.has(target)) return;

        mtrSession.sweepCount = 0;
        mtrSession.pingInterval = setInterval(() => {
          mtrSession.sweepCount++;
          mtrSession.hops.forEach((hop) => {
            if (hop.ip === 'Request timed out' || hop.ip === '???') {
              hop.sent++;
              hop.lost++;
              hop.last = null;

              mtrSession.subscribers.forEach(socketId => {
                io.to(socketId).emit('mtr-ping-result', {
                  hopNum: hop.hopNum,
                  status: 'offline',
                  latency: null
                });
              });
              return;
            }

            const shouldSkip = hop.consecutiveFailures >= 3 && (mtrSession.sweepCount % 10 !== 0);
            if (shouldSkip) {
              hop.sent++;
              hop.lost++;
              hop.last = null;
              mtrSession.subscribers.forEach(socketId => {
                io.to(socketId).emit('mtr-ping-result', {
                  hopNum: hop.hopNum,
                  status: 'offline',
                  latency: null
                });
              });
              return;
            }

            // Intermediate hops are ALWAYS pinged via ICMP because routers do not have open TCP/UDP ports.
            // Only the final destination hop uses the selected TCP/UDP mode.
            const isDestination = (hop.ip === target || hop.ip === mtrSession.resolvedIp || hop.hopNum === mtrSession.hops.length);
            
            const pingFn = (isDestination)
              ? (mode === 'tcp'
                ? (host, ip, cb) => pingHostTcp(host, port, ip, cb)
                : (mode === 'udp'
                  ? (host, ip, cb) => pingHostUdp(host, port, ip, cb)
                  : (host, ip, cb) => pingHost(host, ip, cb)))
              : (host, ip, cb) => pingHost(host, ip, cb);

            pingFn(hop.ip, sourceIP, (err, result) => {
              if (!globalMtrs.has(target)) return;

              hop.sent++;
              if (err || result.status === 'offline') {
                hop.lost++;
                hop.last = null;
                hop.consecutiveFailures = (hop.consecutiveFailures || 0) + 1;
                mtrSession.subscribers.forEach(socketId => {
                  io.to(socketId).emit('mtr-ping-result', {
                    hopNum: hop.hopNum,
                    status: 'offline',
                    latency: null
                  });
                });
              } else {
                hop.consecutiveFailures = 0;
                const latency = result.latency;
                hop.received++;
                hop.last = latency;
                if (hop.best === null || latency < hop.best) hop.best = latency;
                if (hop.worst === null || latency > hop.worst) hop.worst = latency;
                hop.totalLatency += latency;

                mtrSession.subscribers.forEach(socketId => {
                  io.to(socketId).emit('mtr-ping-result', {
                    hopNum: hop.hopNum,
                    status: 'online',
                    latency: latency
                  });
                });
              }
            });
          });
        }, 2000);
      });
    };

    startTracerouteProcess();
  }
  return mtrSession;
}

function stopMtrSession(target) {
  const session = globalMtrs.get(target);
  if (session) {
    if (session.tracerouteProcess) {
      try {
        session.tracerouteProcess.kill();
      } catch (e) {}
    }
    if (session.pingInterval) {
      clearInterval(session.pingInterval);
    }
    if (session.sshConn) {
      try {
        session.sshConn.end();
      } catch (e) {}
    }
    globalMtrs.delete(target);
    console.log(`MTR session for ${target} stopped and cleaned up.`);
  }
}

function stopAllBackgroundMtrs() {
  console.log('Stopping all background MTR sessions');
  globalMtrs.forEach((session, target) => {
    stopMtrSession(target);
  });
}

function stopJobsForSocket(socketId) {
  const jobs = activeJobs.get(socketId);
  if (jobs) {
    jobs.forEach((job) => {
      if (job && typeof job.stop === 'function') {
        job.stop();
      } else {
        clearInterval(job);
        clearTimeout(job);
      }
    });
    activeJobs.delete(socketId);
  }
}

async function fetchPublicIpForSource(sourceIP) {
  const apis = [
    'https://api.ipify.org?format=json',
    'https://ipinfo.io/json',
    'https://api.myip.com',
    'https://ipapi.co/json'
  ];
  
  const options = {};
  if (sourceIP && net.isIP(sourceIP)) {
    options.localAddress = sourceIP;
  }

  for (const api of apis) {
    try {
      const data = await fetchJsonHttps(api, options);
      const ip = data.ip || data.query || data.ip_address;
      if (ip) {
        return ip;
      }
    } catch (err) {
      console.warn(`Failed to fetch public IP for source ${sourceIP} from ${api}:`, err.message);
    }
  }
  return 'Unavailable';
}

// API to get the detected public IP (supports binding to a specific local interface)
app.get('/api/public-ip', async (req, res) => {
  const { sourceIP } = req.query;
  if (sourceIP && sourceIP !== 'default' && sourceIP !== 'custom' && net.isIP(sourceIP)) {
    const ip = await fetchPublicIpForSource(sourceIP);
    res.json({ ip });
  } else {
    res.json({ ip: publicIp });
  }
});

// Endpoint to log browser-side errors
app.post('/api/log-error', (req, res) => {
  console.error('--- BROWSER ERROR ---');
  console.error(JSON.stringify(req.body, null, 2));
  console.error('---------------------');
  res.sendStatus(200);
});

// API to query BGP routing details from RIPEstat Looking Glass
app.get('/api/bgp', async (req, res) => {
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ error: 'IP is required' });

  try {
    const url = `https://stat.ripe.net/data/looking-glass/data.json?resource=${encodeURIComponent(ip)}`;
    const data = await fetchJsonHttps(url);
    
    const routes = [];
    if (data && data.data && data.data.rrcs) {
      data.data.rrcs.forEach(rrc => {
        if (rrc.peers) {
          rrc.peers.forEach(peer => {
            routes.push({
              prefix: peer.prefix,
              next_hop: peer.next_hop,
              peer_asn: peer.as_path.split(' ')[0],
              as_path: peer.as_path,
              origin: peer.origin,
              latest_time: peer.latest_time
            });
          });
        }
      });
    }

    // Sort routes: put paths containing 6939 (Hurricane Electric) first, then by shortest AS path
    routes.sort((a, b) => {
      const hasHeA = a.as_path.includes('6939');
      const hasHeB = b.as_path.includes('6939');
      if (hasHeA && !hasHeB) return -1;
      if (!hasHeA && hasHeB) return 1;
      return a.as_path.split(' ').length - b.as_path.split(' ').length;
    });

    // Limit to 15 routes
    const selectedRoutes = routes.slice(0, 15);
    
    res.json({
      prefix: selectedRoutes[0] ? selectedRoutes[0].prefix : `${ip}/32`,
      routes: selectedRoutes
    });
  } catch (err) {
    console.error('Error fetching BGP details:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shutdown', (req, res) => {
  res.json({ success: true });
  console.log('Shutdown requested by client. Exiting...');
  setTimeout(() => {
    process.exit(0);
  }, 500);
});

async function triggerGlobalping(target, socket) {
  try {
    const data = await fetchJsonHttps('https://api.globalping.io/v1/measurements', {
      method: 'POST',
      body: JSON.stringify({
        type: 'ping',
        target: target,
        locations: [{ country: 'BD' }],
        limit: 5 // Query up to 5 probes to find the best path
      })
    });
    
    const measurementId = data.id;
    if (!measurementId) return;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 15) {
        clearInterval(interval);
        return;
      }

      try {
        const checkData = await fetchJsonHttps(`https://api.globalping.io/v1/measurements/${measurementId}`);

        if (checkData.status === 'finished') {
          clearInterval(interval);
          
          let bestMin = Infinity;
          let bestProvider = '';
          let bestAsn = '';
          let bestCity = '';

          if (checkData.results) {
            checkData.results.forEach(r => {
              if (r.result && r.result.stats && r.result.stats.min !== null && r.result.stats.min !== undefined) {
                const minVal = r.result.stats.min;
                if (minVal < bestMin) {
                  bestMin = minVal;
                  bestProvider = r.probe.network || `AS${r.probe.asn}`;
                  bestAsn = r.probe.asn || '';
                  bestCity = r.probe.city || '';
                }
              }
            });
          }

          if (bestMin !== Infinity) {
            // Clean up provider name (e.g. remove "Limited", "Ltd.", etc.)
            let shortProvider = bestProvider
              .replace(/\s+(Ltd|Limited|Technologies|Ltd\.|Communications|Network|Internet)\b/gi, '')
              .trim();

            socket.emit('bd-best-latency', {
              target,
              latency: bestMin,
              provider: shortProvider,
              asn: bestAsn,
              city: bestCity
            });
          }
        } else if (checkData.status === 'failed') {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Error polling Globalping:', err);
      }
    }, 1500);
  } catch (err) {
    console.error('Error triggering Globalping:', err);
  }
}

function startServer(port) {
  server.listen(port, () => {
    console.log(`PulseTrace diagnostic server running on http://localhost:${port}`);
  });

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use. Opening app window...`);
      if (process.platform === 'win32') {
        const fs = require('fs');
        let edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
        if (!fs.existsSync(edgePath)) {
          edgePath = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
        }
        const appUrl = `http://localhost:${port}/`;
        if (fs.existsSync(edgePath)) {
          const edgeProcess = spawn(edgePath, [`--app=${appUrl}`], {
            detached: true,
            stdio: 'ignore'
          });
          edgeProcess.unref();
        } else {
          const fallbackProcess = spawn('cmd', ['/c', 'start', 'msedge', `--app=${appUrl}`], {
            detached: true,
            stdio: 'ignore'
          });
          fallbackProcess.unref();
        }
      }
      setTimeout(() => {
        process.exit(0);
      }, 1000); // Give it 1 second to spawn the browser before exiting
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

const activePortScans = new Map(); // socket.id -> cancelCallback

const PORT_SERVICES = {
  7: 'Echo', 9: 'Discard', 13: 'Daytime', 17: 'QOTD', 19: 'CharGen',
  20: 'FTP-Data', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP',
  37: 'Time', 49: 'TACACS', 53: 'DNS', 70: 'Gopher', 79: 'Finger',
  80: 'HTTP', 88: 'Kerberos', 102: 'MS Exchange', 110: 'POP3',
  111: 'RPC / Portmap', 113: 'Ident', 115: 'SFTP', 119: 'NNTP',
  123: 'NTP', 135: 'RPC-EPMAP', 137: 'NetBIOS-NS', 138: 'NetBIOS-DGM',
  139: 'NetBIOS-SSN', 143: 'IMAP', 161: 'SNMP', 179: 'BGP', 194: 'IRC',
  389: 'LDAP', 443: 'HTTPS', 444: 'SNPP', 445: 'SMB / Active Dir',
  465: 'SMTPS', 500: 'ISAKMP / IPsec', 512: 'Rexec', 513: 'Rlogin',
  514: 'Syslog', 515: 'LPD', 520: 'RIP', 540: 'UUCP', 548: 'AFP',
  563: 'NNTPS', 587: 'SMTP (Submission)', 631: 'IPP', 636: 'LDAPS',
  808: 'Net.Tcp Port Sharing', 873: 'Rsync', 990: 'FTPS', 992: 'Telnets',
  993: 'IMAPS', 995: 'POP3S', 1080: 'SOCKS', 1194: 'OpenVPN',
  1243: 'SubSeven', 1352: 'Lotus Notes', 1433: 'MSSQL', 1434: 'MSSQL-Monitor',
  1521: 'Oracle', 1701: 'L2TP', 1720: 'H.323', 1723: 'PPTP',
  1883: 'MQTT', 1900: 'SSDP', 2000: 'SCCP (Skinny)', 2049: 'NFS',
  2082: 'cPanel', 2083: 'cPanel SSL', 2086: 'WHM', 2087: 'WHM SSL',
  3128: 'Squid Proxy', 3268: 'LDAP GC', 3269: 'LDAP GC SSL',
  3306: 'MySQL', 3307: 'MySQL Alt', 3389: 'RDP', 3690: 'SVN',
  4500: 'IPsec NAT-T', 4840: 'OPC UA', 4848: 'GlassFish',
  5000: 'UPnP / Docker', 5001: 'iperf / Slingbox', 5060: 'SIP',
  5061: 'SIPS', 5190: 'AIM', 5222: 'XMPP', 5223: 'XMPP SSL',
  5432: 'PostgreSQL', 5554: 'Sasser / ADB', 5631: 'pcAnywhere',
  5672: 'AMQP', 5800: 'VNC over HTTP', 5900: 'VNC', 5901: 'VNC Display 1',
  5902: 'VNC Display 2', 5984: 'CouchDB', 5985: 'WinRM (HTTP)',
  5986: 'WinRM (HTTPS)', 6000: 'X11', 6001: 'X11 Alt', 6379: 'Redis',
  6443: 'Kubernetes API', 6667: 'IRC Alt', 8000: 'vBook / Alt HTTP',
  8008: 'HTTP Alt', 8080: 'HTTP-Proxy / Alt HTTP', 8081: 'Alt HTTP',
  8243: 'HTTPS Alt', 8443: 'HTTPS Alt', 8888: 'Jupyter / Alt HTTP',
  9000: 'SonarQube / Portainer', 9001: 'Tor / Alt HTTP', 9092: 'Kafka',
  9100: 'JetDirect', 9200: 'Elasticsearch', 9443: 'HTTPS Alt',
  9999: 'Urchin / Trojan', 10000: 'Webmin', 20000: 'Usermin',
  27017: 'MongoDB', 27018: 'MongoDB Alt', 50000: 'SAP'
};

function getPortService(port) {
  return PORT_SERVICES[port] || 'Unknown';
}

function checkPort(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = 'closed';

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      status = 'open';
      socket.destroy();
    });

    socket.on('timeout', () => {
      status = 'filtered';
      socket.destroy();
    });

    socket.on('error', () => {
      status = 'closed';
    });

    socket.on('close', () => {
      resolve({ port, status });
    });

    socket.connect(port, host);
  });
}

startServer(PORT);

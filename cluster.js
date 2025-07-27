// cluster.js - Multi-process clustering for handling 500+ users
const cluster = require('cluster');
const os = require('os');

const numCPUs = os.cpus().length;
const MAX_WORKERS = process.env.MAX_WORKERS || Math.min(numCPUs, 8);

if (cluster.isMaster) {
  console.log(`🚀 Master process ${process.pid} is running`);
  console.log(`🔧 Starting ${MAX_WORKERS} worker processes...`);

  // Fork workers
  for (let i = 0; i < MAX_WORKERS; i++) {
    cluster.fork();
  }

  // Handle worker exits
  cluster.on('exit', (worker, code, signal) => {
    console.log(`💥 Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Master received SIGTERM, shutting down workers...');
    
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    
    setTimeout(() => {
      process.exit(0);
    }, 10000);
  });

  // Worker monitoring
  setInterval(() => {
    const workerCount = Object.keys(cluster.workers).length;
    console.log(`📊 Active workers: ${workerCount}/${MAX_WORKERS}`);
  }, 30000);

} else {
  // Worker process
  require('./server.js');
  console.log(`⚡ Worker ${process.pid} started`);
}
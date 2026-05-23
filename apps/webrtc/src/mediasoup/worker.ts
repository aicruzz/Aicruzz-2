/* eslint-disable @typescript-eslint/no-explicit-any */
// mediasoup requires native build — using dynamic import + any types
// so the service compiles without the native binary present.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const os = require('os') as typeof import('os');

const workers: any[] = [];
let nextWorkerIndex = 0;
let ms: any = null;

const WORKER_SETTINGS = {
  logLevel: 'warn',
  rtcMinPort: parseInt(process.env.RTC_MIN_PORT ?? '40000'),
  rtcMaxPort: parseInt(process.env.RTC_MAX_PORT ?? '49999'),
};

async function getMediasoup(): Promise<any> {
  if (!ms) {
    try {
      ms = await import('mediasoup');
    } catch {
      throw new Error(
        'mediasoup native module not built. Run:\n  npm install mediasoup\n  npm rebuild mediasoup',
      );
    }
  }
  return ms;
}

export async function createWorkers(): Promise<void> {
  const mediasoup = await getMediasoup();
  const numWorkers = Math.min(
    parseInt(process.env.MEDIASOUP_WORKER_MAX ?? '4'),
    os.cpus().length,
  );

  console.log(`[mediasoup] Creating ${numWorkers} worker(s)`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker(WORKER_SETTINGS);

    worker.on('died', (error: Error) => {
      console.error(`[mediasoup] Worker ${i} died:`, error);
      const idx = workers.indexOf(worker);
      if (idx !== -1) workers.splice(idx, 1);
      spawnWorker(mediasoup).catch(console.error);
    });

    workers.push(worker);
    console.log(`[mediasoup] Worker pid: ${worker.pid}`);
  }
}

async function spawnWorker(mediasoup: any): Promise<void> {
  const worker = await mediasoup.createWorker(WORKER_SETTINGS);
  worker.on('died', (e: Error) => console.error('[mediasoup] Replacement died:', e));
  workers.push(worker);
}

export function getNextWorker(): any {
  if (workers.length === 0) throw new Error('No mediasoup workers initialised');
  const worker = workers[nextWorkerIndex % workers.length];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}

export async function closeAllWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close() as Promise<void>));
  workers.length = 0;
}

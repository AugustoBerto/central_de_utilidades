import { readFileSync, statfsSync } from 'node:fs';
import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os';

function readCpuSnapshot() {
  try {
    const fields = readFileSync('/proc/stat', 'utf8')
      .match(/^cpu\s+(.+)$/m)?.[1]
      .trim()
      .split(/\s+/)
      .map(Number);
    if (!fields) return null;
    const idle = fields[3] + (fields[4] ?? 0);
    return { idle, total: fields.reduce((sum, value) => sum + value, 0) };
  } catch {
    return null;
  }
}

function readNetworkSnapshot() {
  try {
    return readFileSync('/proc/net/dev', 'utf8')
      .split('\n')
      .slice(2)
      .reduce(
        (total, line) => {
          const [name, values] = line.trim().split(':');
          if (!name || name === 'lo') return total;
          const fields = values.trim().split(/\s+/).map(Number);
          return { rx: total.rx + fields[0], tx: total.tx + fields[8] };
        },
        { rx: 0, tx: 0 }
      );
  } catch {
    return null;
  }
}

function diskMetrics(path) {
  try {
    const stats = statfsSync(path);
    const totalBytes = stats.blocks * stats.bsize;
    const availableBytes = stats.bavail * stats.bsize;
    const usedBytes = totalBytes - availableBytes;
    return {
      path,
      totalBytes,
      usedBytes,
      usedPercent: totalBytes ? (usedBytes / totalBytes) * 100 : null
    };
  } catch {
    return null;
  }
}

export class SystemMetricsService {
  constructor({ mode, filesDir }) {
    this.mode = mode;
    this.filesDir = filesDir;
    this.previousCpu = null;
    this.previousNetwork = null;
  }

  collect() {
    const collectedAt = new Date().toISOString();
    if (this.mode === 'disabled')
      return {
        version: 1,
        source: { type: 'disabled' },
        status: 'disabled',
        collectedAt,
        metrics: null
      };

    const cpuSnapshot = readCpuSnapshot();
    const networkSnapshot = readNetworkSnapshot();
    const previousCpu = this.previousCpu;
    const previousNetwork = this.previousNetwork;
    this.previousCpu = cpuSnapshot;
    this.previousNetwork = networkSnapshot && {
      ...networkSnapshot,
      sampledAt: Date.now()
    };
    const cpuDelta =
      cpuSnapshot && previousCpu ? cpuSnapshot.total - previousCpu.total : null;
    const cpuUsagePercent =
      cpuDelta > 0
        ? ((cpuDelta - (cpuSnapshot.idle - previousCpu.idle)) / cpuDelta) * 100
        : null;
    const elapsedSeconds = previousNetwork
      ? (Date.now() - previousNetwork.sampledAt) / 1_000
      : null;
    const memoryTotal = totalmem();
    const memoryUsed = memoryTotal - freemem();
    const metrics = {
      cpu: {
        usagePercent: cpuUsagePercent,
        load1: loadavg()[0] ?? null,
        cores: cpus().length || null
      },
      memory: {
        usedBytes: memoryUsed,
        totalBytes: memoryTotal,
        usedPercent: memoryTotal ? (memoryUsed / memoryTotal) * 100 : null
      },
      disk: diskMetrics(this.filesDir),
      network:
        networkSnapshot && previousNetwork && elapsedSeconds > 0
          ? {
              receivedBytesPerSecond: Math.max(
                0,
                (networkSnapshot.rx - previousNetwork.rx) / elapsedSeconds
              ),
              sentBytesPerSecond: Math.max(
                0,
                (networkSnapshot.tx - previousNetwork.tx) / elapsedSeconds
              )
            }
          : null,
      uptimeSeconds: uptime(),
      connections: null
    };
    const partial =
      metrics.cpu.usagePercent === null || !metrics.disk || !metrics.network;
    return {
      version: 1,
      source: { type: this.mode === 'container' ? 'container' : 'host' },
      status: partial ? 'degraded' : 'available',
      collectedAt,
      metrics
    };
  }
}

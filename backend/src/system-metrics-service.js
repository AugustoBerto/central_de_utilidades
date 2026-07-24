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
    return { idle: fields[3] + (fields[4] ?? 0), total: fields.reduce((sum, value) => sum + value, 0) };
  } catch {
    return null;
  }
}

function readNetworkSnapshot() {
  try {
    return readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2).reduce(
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
    const usedBytes = totalBytes - stats.bavail * stats.bsize;
    return { path, totalBytes, usedBytes, usedPercent: totalBytes ? (usedBytes / totalBytes) * 100 : null };
  } catch {
    return null;
  }
}

const RANGE_HOURS = { '1h': 1, '6h': 6, '24h': 24 };

function toEnvelope(row) {
  return {
    version: 1,
    source: { type: row.source_type },
    status: row.status,
    collectedAt: row.collected_at,
    metrics: JSON.parse(row.metrics_json)
  };
}

export class SystemMetricsService {
  constructor({ database, mode, filesDir, sampleIntervalSeconds = 5, retentionHours = 24 }) {
    this.database = database;
    this.mode = mode;
    this.filesDir = filesDir;
    this.sampleIntervalMs = Math.max(1, sampleIntervalSeconds) * 1_000;
    this.retentionHours = Math.max(1, retentionHours);
    this.previousCpu = null;
    this.previousNetwork = null;
    this.timer = null;
  }

  collect() {
    const collectedAt = new Date().toISOString();
    if (this.mode === 'disabled')
      return { version: 1, source: { type: 'disabled' }, status: 'disabled', collectedAt, metrics: null };
    const cpuSnapshot = readCpuSnapshot();
    const networkSnapshot = readNetworkSnapshot();
    const previousCpu = this.previousCpu;
    const previousNetwork = this.previousNetwork;
    this.previousCpu = cpuSnapshot;
    this.previousNetwork = networkSnapshot && { ...networkSnapshot, sampledAt: Date.now() };
    const cpuDelta = cpuSnapshot && previousCpu ? cpuSnapshot.total - previousCpu.total : null;
    const memoryTotal = totalmem();
    const memoryUsed = memoryTotal - freemem();
    const elapsedSeconds = previousNetwork ? (Date.now() - previousNetwork.sampledAt) / 1_000 : null;
    const metrics = {
      cpu: { usagePercent: cpuDelta > 0 ? ((cpuDelta - (cpuSnapshot.idle - previousCpu.idle)) / cpuDelta) * 100 : null, load1: loadavg()[0] ?? null, cores: cpus().length || null },
      memory: { usedBytes: memoryUsed, totalBytes: memoryTotal, usedPercent: memoryTotal ? (memoryUsed / memoryTotal) * 100 : null },
      disk: diskMetrics(this.filesDir),
      network: networkSnapshot && previousNetwork && elapsedSeconds > 0 ? { receivedBytesPerSecond: Math.max(0, (networkSnapshot.rx - previousNetwork.rx) / elapsedSeconds), sentBytesPerSecond: Math.max(0, (networkSnapshot.tx - previousNetwork.tx) / elapsedSeconds) } : null,
      uptimeSeconds: uptime(),
      connections: null
    };
    const partial = metrics.cpu.usagePercent === null || !metrics.disk || !metrics.network;
    return { version: 1, source: { type: this.mode === 'container' ? 'container' : 'host' }, status: partial ? 'degraded' : 'available', collectedAt, metrics };
  }

  sample() {
    const sample = this.collect();
    if (!this.database || !sample.metrics) return sample;
    this.database.prepare('INSERT INTO metric_samples (collected_at, source_type, status, metrics_json) VALUES (?, ?, ?, ?)').run(sample.collectedAt, sample.source.type, sample.status, JSON.stringify(sample.metrics));
    const cutoff = new Date(Date.now() - this.retentionHours * 3_600_000).toISOString();
    this.database.prepare('DELETE FROM metric_samples WHERE collected_at < ?').run(cutoff);
    return sample;
  }

  start() {
    if (this.timer || this.mode === 'disabled') return;
    this.sample();
    this.timer = setInterval(() => this.sample(), this.sampleIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  snapshot(range = '1h') {
    if (!this.database) return { ...this.collect(), history: [], samplingIntervalSeconds: this.sampleIntervalMs / 1_000 };
    const hours = RANGE_HOURS[range] ?? RANGE_HOURS['1h'];
    const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
    const rows = this.database.prepare('SELECT * FROM metric_samples WHERE collected_at >= ? ORDER BY collected_at ASC').all(cutoff);
    const latest = rows.at(-1);
    if (!latest) return { ...this.sample(), history: [], samplingIntervalSeconds: this.sampleIntervalMs / 1_000 };
    return { ...toEnvelope(latest), history: rows.map(toEnvelope), samplingIntervalSeconds: this.sampleIntervalMs / 1_000 };
  }
}

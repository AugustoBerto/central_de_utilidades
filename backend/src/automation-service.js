import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { HttpError } from './errors.js';

const MAX_OUTPUT_BYTES = 8_192;
const CATALOG = [
  {
    id: 'runner-diagnostic',
    title: 'Diagnóstico do runner',
    description: 'Confirma que o executor controlado está disponível.',
    impact: 'Não altera arquivos, rede ou configuração.',
    timeoutMs: 5_000,
    parameters: [
      {
        key: 'repeat',
        label: 'Repetições',
        type: 'integer',
        min: 1,
        max: 3,
        default: 1
      }
    ]
  }
];

function nowIso() {
  return new Date().toISOString();
}

function sanitizeOutput(value) {
  return Array.from(
    value.replace(/(?:token|password|secret)\s*[:=]\s*\S+/gi, '[redigido]')
  )
    .filter(
      (character) =>
        character === '\n' ||
        character === '\r' ||
        character === '\t' ||
        character.charCodeAt(0) >= 32
    )
    .join('');
}

function toRun(row) {
  return (
    row && {
      id: row.id,
      automationId: row.automation_id,
      status: row.status,
      parameters: JSON.parse(row.parameters_json),
      output: row.output,
      exitCode: row.exit_code,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms
    }
  );
}

export class AutomationService {
  constructor(database, { enabled }) {
    this.database = database;
    this.enabled = enabled;
    this.running = new Map();
    this.events = new EventEmitter();
  }

  list() {
    return CATALOG.map((automation) => ({
      ...automation,
      available: this.enabled,
      lastRun: toRun(
        this.database
          .prepare(
            'SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY created_at DESC LIMIT 1'
          )
          .get(automation.id)
      )
    }));
  }

  getCatalogEntry(id) {
    const entry = CATALOG.find((automation) => automation.id === id);
    if (!entry)
      throw new HttpError(404, 'AUTOMATION_NOT_FOUND', 'Automação não encontrada.');
    return entry;
  }

  validateParameters(entry, parameters = {}) {
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))
      throw new HttpError(422, 'PARAMETERS_INVALID', 'Parâmetros inválidos.');
    const allowed = new Set(entry.parameters.map((parameter) => parameter.key));
    if (Object.keys(parameters).some((key) => !allowed.has(key)))
      throw new HttpError(422, 'PARAMETERS_INVALID', 'Parâmetros inválidos.');
    const repeat = parameters.repeat ?? 1;
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 3)
      throw new HttpError(422, 'PARAMETERS_INVALID', 'Parâmetros inválidos.', {
        repeat: 'Informe um número inteiro entre 1 e 3.'
      });
    return { repeat };
  }

  start(id, parameters, userId) {
    if (!this.enabled)
      throw new HttpError(
        403,
        'AUTOMATIONS_DISABLED',
        'Automações estão desabilitadas nesta instalação.'
      );
    const entry = this.getCatalogEntry(id);
    if (this.running.has(entry.id))
      throw new HttpError(
        409,
        'AUTOMATION_RUNNING',
        'Esta automação já está em execução.'
      );
    const validated = this.validateParameters(entry, parameters);
    const timestamp = nowIso();
    const run = {
      id: randomUUID(),
      automationId: entry.id,
      status: 'queued',
      parameters: validated,
      startedAt: timestamp,
      output: ''
    };
    this.database
      .prepare(
        'INSERT INTO automation_runs (id, automation_id, user_id, status, parameters_json, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        run.id,
        entry.id,
        userId,
        run.status,
        JSON.stringify(validated),
        timestamp,
        timestamp
      );
    queueMicrotask(() => this.execute(entry, run));
    return run;
  }

  execute(entry, run) {
    const startedAt = Date.now();
    const code =
      'const repeat = Number(process.argv[1]); for (let index = 0; index < repeat; index += 1) console.log(`runner diagnostic ${index + 1}/${repeat}`);';
    const child = spawn(process.execPath, ['-e', code, String(run.parameters.repeat)], {
      cwd: '/tmp',
      env: { PATH: process.env.PATH ?? '' },
      shell: false,
      windowsHide: true
    });
    this.running.set(entry.id, { child, runId: run.id });
    this.update(run.id, { status: 'running' });
    let output = '';
    let timedOut = false;
    const append = (chunk) => {
      if (Buffer.byteLength(output) < MAX_OUTPUT_BYTES)
        output += chunk
          .toString('utf8')
          .slice(0, MAX_OUTPUT_BYTES - Buffer.byteLength(output));
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, entry.timeoutMs);
    child.on('error', () => append('Falha ao iniciar a automação.\n'));
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      this.running.delete(entry.id);
      const current = this.getRun(run.id);
      const status =
        current.status === 'cancelled'
          ? 'cancelled'
          : timedOut
            ? 'timed_out'
            : exitCode === 0
              ? 'succeeded'
              : 'failed';
      this.update(run.id, {
        status,
        output: sanitizeOutput(output),
        exitCode,
        completedAt: nowIso(),
        durationMs: Date.now() - startedAt
      });
    });
  }

  update(id, changes) {
    const current = this.getRun(id);
    const next = { ...current, ...changes };
    this.database
      .prepare(
        'UPDATE automation_runs SET status = ?, output = ?, exit_code = ?, completed_at = ?, duration_ms = ? WHERE id = ?'
      )
      .run(
        next.status,
        next.output,
        next.exitCode,
        next.completedAt,
        next.durationMs,
        id
      );
    const run = this.getRun(id);
    this.events.emit(id, run);
    return run;
  }

  getRun(id) {
    const run = toRun(
      this.database.prepare('SELECT * FROM automation_runs WHERE id = ?').get(id)
    );
    if (!run) throw new HttpError(404, 'RUN_NOT_FOUND', 'Execução não encontrada.');
    return run;
  }

  cancel(id) {
    const run = this.getRun(id);
    const running = this.running.get(run.automationId);
    if (!running || running.runId !== id)
      throw new HttpError(
        409,
        'RUN_NOT_CANCELLABLE',
        'Esta execução não pode ser cancelada.'
      );
    running.child.kill('SIGTERM');
    return this.update(id, {
      status: 'cancelled',
      completedAt: nowIso(),
      durationMs: null
    });
  }
}

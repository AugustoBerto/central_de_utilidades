import 'dotenv/config';

import { createApp } from './app.js';
import { AuthService } from './auth-service.js';
import { AutomationService } from './automation-service.js';
import { loadConfig } from './config.js';
import { openDatabase } from './database.js';
import { ShortcutService } from './shortcut-service.js';
import { FileService } from './file-service.js';
import { NoteService } from './note-service.js';
import { SystemMetricsService } from './system-metrics-service.js';

const config = loadConfig();
const database = openDatabase(config.databasePath);
const systemMetricsService = new SystemMetricsService({
  mode: config.systemMetricsMode,
  filesDir: config.filesDir
});
const app = createApp({
  authService: new AuthService(database, config),
  automationService: new AutomationService(database, {
    enabled: config.automationsEnabled
  }),
  fileService: new FileService(database, config),
  noteService: new NoteService(database),
  shortcutService: new ShortcutService(database, config),
  config,
  systemMetricsService,
  environment: config.environment
});

app.set('trust proxy', config.trustProxyHops);
app.listen(config.port, '0.0.0.0', () => {
  console.info(`Backend listening on port ${config.port}`);
});

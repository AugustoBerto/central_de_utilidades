import 'dotenv/config';

import { createApp } from './app.js';
import { AuthService } from './session-auth-service.js';
import { AutomationService } from './automation-service.js';
import { loadConfig } from './config.js';
import { openDatabase } from './database.js';
import { DriveSettingsService } from './drive-settings-service.js';
import { FileService } from './file-service.js';
import { FolderService } from './folder-service.js';
import { NoteService } from './note-service.js';
import { ShortcutService } from './shortcut-service.js';
import { SystemMetricsService } from './system-metrics-service.js';

const config = loadConfig();
const database = openDatabase(config.databasePath);
const driveSettingsService = new DriveSettingsService(database, {
  filesDir: config.filesDir,
  defaultReservedBytes: config.driveReservedBytes,
  defaultMaxUploadBytes: config.maxUploadBytes,
  uploadHardLimitBytes: config.driveUploadHardLimitBytes
});
const folderService = new FolderService(database);
const systemMetricsService = new SystemMetricsService({
  database,
  mode: config.systemMetricsMode,
  filesDir: config.filesDir,
  sampleIntervalSeconds: config.metricsSampleIntervalSeconds,
  retentionHours: config.metricsRetentionHours
});
systemMetricsService.start();
const app = createApp({
  authService: new AuthService(database, config),
  automationService: new AutomationService(database, {
    enabled: config.automationsEnabled
  }),
  driveSettingsService,
  fileService: new FileService(database, { ...config, driveSettingsService }),
  folderService,
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

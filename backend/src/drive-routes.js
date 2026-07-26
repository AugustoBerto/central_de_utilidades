import { DriveItemsService } from './drive-items-service.js';

export function registerDriveRoutes(
  app,
  {
    driveItemsService,
    driveSettingsService,
    fileService,
    folderService,
    requireAuth,
    requireCsrf,
    requireSameOrigin
  }
) {
  const itemsService = driveItemsService ?? new DriveItemsService(fileService.database, {
    filesDir: fileService.filesDir,
    fileService,
    folderService
  });

  app.get('/api/drive/status', requireAuth, (_request, response, next) => {
    try {
      response.json(driveSettingsService.status());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/drive/settings', requireAuth, (_request, response, next) => {
    try {
      response.json(driveSettingsService.get());
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    '/api/drive/settings',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        const settings = driveSettingsService.update(request.body ?? {}, {
          pendingBytes: fileService.pendingBytes()
        });
        response.json({ settings, status: driveSettingsService.status() });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get('/api/drive/items', requireAuth, (request, response, next) => {
    try {
      response.json(
        itemsService.list({
          folderId: request.query.folderId,
          query: request.query.q,
          scope: request.query.scope,
          sort: request.query.sort,
          order: request.query.order,
          from: request.query.from,
          to: request.query.to,
          minSize: request.query.minSize,
          maxSize: request.query.maxSize,
          type: request.query.type,
          limit: request.query.limit,
          offset: request.query.offset
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/drive/items/move',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response.json(itemsService.move(request.body ?? {}));
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    '/api/drive/items/delete',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        response.json(await itemsService.remove(request.body ?? {}));
      } catch (error) {
        next(error);
      }
    }
  );

  app.get('/api/folders', requireAuth, (request, response, next) => {
    try {
      response.json({ folders: folderService.list(request.query.parentId) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/folders/tree', requireAuth, (_request, response, next) => {
    try {
      response.json({ folders: folderService.tree() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/folders/:folderId', requireAuth, (request, response, next) => {
    try {
      const folder = folderService.get(request.params.folderId);
      response.json({ folder, path: folderService.path(folder.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/folders',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response.status(201).json({ folder: folderService.create(request.body ?? {}) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    '/api/folders/:folderId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response.json({
          folder: folderService.update(request.params.folderId, request.body ?? {})
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    '/api/folders/:folderId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        folderService.remove(request.params.folderId);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );

  app.get('/api/files', requireAuth, (request, response, next) => {
    try {
      response.json(
        fileService.list({
          folderId: request.query.folderId,
          query: request.query.q,
          scope: request.query.scope,
          sort: request.query.sort,
          order: request.query.order,
          from: request.query.from,
          to: request.query.to,
          minSize: request.query.minSize,
          maxSize: request.query.maxSize,
          type: request.query.type,
          limit: request.query.limit,
          offset: request.query.offset
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/files',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const file = await fileService.upload(request, {
          originalName: request.get('x-file-name'),
          mimeType: request.get('content-type'),
          contentLength: request.get('content-length'),
          folderId: request.get('x-folder-id')
        });
        response.status(201).json({ file });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    '/api/files/:fileId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    (request, response, next) => {
      try {
        response.json({
          file: fileService.update(request.params.fileId, request.body ?? {})
        });
      } catch (error) {
        next(error);
      }
    }
  );

  const sendFile = (preview) => async (request, response, next) => {
    try {
      const { file, path } = await fileService.open(request.params.fileId, preview);
      const disposition = preview ? 'inline' : 'attachment';
      response
        .type(file.mimeType)
        .set('X-Content-Type-Options', 'nosniff')
        .set(
          'Content-Disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
        )
        .sendFile(path, (error) => error && next(error));
    } catch (error) {
      next(error);
    }
  };

  app.get('/api/files/:fileId/download', requireAuth, sendFile(false));
  app.get('/api/files/:fileId/preview', requireAuth, sendFile(true));
  app.delete(
    '/api/files/:fileId',
    requireAuth,
    requireSameOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        await fileService.remove(request.params.fileId);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );
}

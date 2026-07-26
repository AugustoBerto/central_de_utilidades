import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/database.js';
import { DriveItemsService } from '../src/drive-items-service.js';
import { FileService } from '../src/file-service.js';
import { FolderService } from '../src/folder-service.js';

const resources = [];

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'painel-drive-items-'));
  const filesDir = join(directory, 'files');
  const database = openDatabase(join(directory, 'app.sqlite'));
  const folderService = new FolderService(database);
  const fileService = new FileService(database, {
    filesDir,
    maxUploadBytes: 1024
  });
  const service = new DriveItemsService(database, {
    filesDir,
    fileService,
    folderService
  });
  resources.push({ database, directory });
  return { database, directory, filesDir, fileService, folderService, service };
}

function insertFile(database, filesDir, {
  name,
  folderId = null,
  size = 1,
  mimeType = 'text/plain'
}) {
  const storageName = `stored-${Math.random().toString(16).slice(2)}`;
  const timestamp = new Date().toISOString();
  writeFileSync(join(filesDir, storageName), Buffer.alloc(size, 1));
  const result = database
    .prepare(
      `INSERT INTO files
       (storage_name, original_name, mime_type, size_bytes, folder_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(storageName, name, mimeType, size, folderId, timestamp, timestamp);
  return { id: Number(result.lastInsertRowid), storageName };
}

function caught(action) {
  try {
    return action();
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  for (const { database, directory } of resources.splice(0)) {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('DriveItemsService', () => {
  it('lista pastas antes de arquivos e ordena arquivos pela coluna solicitada', () => {
    const { database, filesDir, folderService, service } = setup();
    folderService.create({ name: 'Zeta' });
    folderService.create({ name: 'Alpha' });
    insertFile(database, filesDir, { name: 'menor.txt', size: 2 });
    insertFile(database, filesDir, { name: 'maior.txt', size: 20 });

    const result = service.list({ sort: 'size', order: 'desc' });

    expect(result.items.map((item) => `${item.kind}:${item.name}`)).toEqual([
      'folder:Alpha',
      'folder:Zeta',
      'file:maior.txt',
      'file:menor.txt'
    ]);
    expect(result.items.at(-1)).toMatchObject({
      typeLabel: 'Texto',
      previewAvailable: true
    });
  });

  it('pesquisa arquivos e pastas em toda a hierarquia com o caminho completo', () => {
    const { database, filesDir, folderService, service } = setup();
    const projects = folderService.create({ name: 'Projetos' });
    const reports = folderService.create({ name: 'Relatórios anuais', parentId: projects.id });
    insertFile(database, filesDir, {
      name: 'relatório-final.pdf',
      folderId: reports.id,
      mimeType: 'application/pdf'
    });

    const folders = service.list({ query: 'anuais' });
    const files = service.list({ query: 'final' });

    expect(folders.items[0]).toMatchObject({
      kind: 'folder',
      folderPath: 'Projetos',
      itemPath: 'Projetos / Relatórios anuais'
    });
    expect(files.items[0]).toMatchObject({
      kind: 'file',
      folderPath: 'Projetos / Relatórios anuais',
      itemPath: 'Projetos / Relatórios anuais / relatório-final.pdf'
    });
  });

  it('move arquivos e pastas em uma única transação', () => {
    const { database, filesDir, folderService, service } = setup();
    const source = folderService.create({ name: 'Origem' });
    const destination = folderService.create({ name: 'Destino' });
    const child = folderService.create({ name: 'Pasta móvel', parentId: source.id });
    const file = insertFile(database, filesDir, {
      name: 'documento.txt',
      folderId: source.id
    });

    expect(
      service.move({
        items: [
          { kind: 'folder', id: child.id },
          { kind: 'file', id: file.id }
        ],
        destinationFolderId: destination.id
      })
    ).toEqual({ moved: 2, destinationFolderId: destination.id });
    expect(folderService.get(child.id).parentId).toBe(destination.id);
    expect(database.prepare('SELECT folder_id FROM files WHERE id = ?').get(file.id).folder_id)
      .toBe(destination.id);
  });

  it('recusa conflitos e ciclos sem mover parcialmente a seleção', () => {
    const { database, filesDir, folderService, service } = setup();
    const source = folderService.create({ name: 'Origem' });
    const destination = folderService.create({ name: 'Destino' });
    const child = folderService.create({ name: 'Filha', parentId: source.id });
    const selected = insertFile(database, filesDir, {
      name: 'duplicado.txt',
      folderId: source.id
    });
    insertFile(database, filesDir, {
      name: 'duplicado.txt',
      folderId: destination.id
    });

    expect(
      caught(() =>
        service.move({
          items: [{ kind: 'file', id: selected.id }],
          destinationFolderId: destination.id
        })
      )
    ).toMatchObject({ status: 409, code: 'ITEM_NAME_CONFLICT' });
    expect(database.prepare('SELECT folder_id FROM files WHERE id = ?').get(selected.id).folder_id)
      .toBe(source.id);

    expect(
      caught(() =>
        service.move({
          items: [{ kind: 'folder', id: source.id }],
          destinationFolderId: child.id
        })
      )
    ).toMatchObject({ status: 422, code: 'FOLDER_CYCLE' });
    expect(folderService.get(source.id).parentId).toBeNull();
  });

  it('exclui arquivos e pastas vazias em lote, incluindo os dados físicos', async () => {
    const { database, filesDir, folderService, service } = setup();
    const folder = folderService.create({ name: 'Vazia' });
    const first = insertFile(database, filesDir, { name: 'um.txt' });
    const second = insertFile(database, filesDir, { name: 'dois.txt' });

    await expect(
      service.remove({
        items: [
          { kind: 'file', id: first.id },
          { kind: 'file', id: second.id },
          { kind: 'folder', id: folder.id }
        ]
      })
    ).resolves.toEqual({ deleted: 3 });

    expect(database.prepare('SELECT COUNT(*) AS total FROM files').get().total).toBe(0);
    expect(database.prepare('SELECT COUNT(*) AS total FROM folders').get().total).toBe(0);
    expect(existsSync(join(filesDir, first.storageName))).toBe(false);
    expect(existsSync(join(filesDir, second.storageName))).toBe(false);
  });

  it('não exclui parcialmente quando a seleção contém pasta não vazia', async () => {
    const { database, filesDir, folderService, service } = setup();
    const folder = folderService.create({ name: 'Com conteúdo' });
    const file = insertFile(database, filesDir, {
      name: 'preservado.txt',
      folderId: folder.id
    });

    await expect(
      service.remove({
        items: [
          { kind: 'file', id: file.id },
          { kind: 'folder', id: folder.id }
        ]
      })
    ).rejects.toMatchObject({ status: 409, code: 'FOLDER_NOT_EMPTY' });

    expect(database.prepare('SELECT id FROM files WHERE id = ?').get(file.id)).toBeTruthy();
    expect(folderService.get(folder.id)).toBeTruthy();
    expect(existsSync(join(filesDir, file.storageName))).toBe(true);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/database.js';
import { FolderService } from '../src/folder-service.js';

const resources = [];

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'painel-folders-'));
  const database = openDatabase(join(directory, 'app.sqlite'));
  resources.push({ database, directory });
  return { database, service: new FolderService(database) };
}

function caught(action) {
  try {
    action();
    return null;
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

describe('FolderService', () => {
  it('cria, lista, renomeia e resolve o caminho de pastas', () => {
    const { service } = setup();
    const projects = service.create({ name: 'Projetos' });
    const year = service.create({ name: '2026', parentId: projects.id });

    expect(service.list()).toEqual([projects]);
    expect(service.list(projects.id)).toEqual([year]);
    expect(service.path(year.id).map((folder) => folder.name)).toEqual([
      'Projetos',
      '2026'
    ]);

    const renamed = service.update(year.id, { name: 'Arquivados' });
    expect(renamed).toMatchObject({
      id: year.id,
      parentId: projects.id,
      name: 'Arquivados'
    });
  });

  it('retorna a árvore completa com profundidade e caminho para seletores', () => {
    const { service } = setup();
    const projects = service.create({ name: 'Projetos' });
    service.create({ name: '2026', parentId: projects.id });
    service.create({ name: 'Documentos' });

    expect(service.tree()).toEqual([
      expect.objectContaining({
        name: 'Documentos',
        path: 'Documentos',
        depth: 0
      }),
      expect.objectContaining({
        name: 'Projetos',
        path: 'Projetos',
        depth: 0
      }),
      expect.objectContaining({
        name: '2026',
        path: 'Projetos / 2026',
        depth: 1
      })
    ]);
  });

  it('bloqueia nomes duplicados e ciclos na hierarquia', () => {
    const { service } = setup();
    const root = service.create({ name: 'Documentos' });
    const child = service.create({ name: 'Projetos', parentId: root.id });
    const grandchild = service.create({ name: 'Ativos', parentId: child.id });

    expect(caught(() => service.create({ name: 'documentos' }))).toMatchObject({
      status: 409,
      code: 'FOLDER_NAME_CONFLICT'
    });
    expect(caught(() => service.update(root.id, { parentId: grandchild.id }))).toMatchObject({
      status: 422,
      code: 'FOLDER_CYCLE'
    });
  });

  it('não remove pastas que ainda possuem subpastas ou arquivos', () => {
    const { database, service } = setup();
    const root = service.create({ name: 'Documentos' });
    const child = service.create({ name: 'Temporários', parentId: root.id });

    expect(caught(() => service.remove(root.id))).toMatchObject({
      status: 409,
      code: 'FOLDER_NOT_EMPTY'
    });

    service.remove(child.id);
    database
      .prepare(
        `INSERT INTO files
         (storage_name, original_name, mime_type, size_bytes, folder_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run('stored-file', 'arquivo.txt', 'text/plain', 3, root.id, '2026-01-01', '2026-01-01');

    expect(caught(() => service.remove(root.id))).toMatchObject({
      status: 409,
      code: 'FOLDER_NOT_EMPTY'
    });
  });
});

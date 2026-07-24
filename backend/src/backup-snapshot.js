import Database from 'better-sqlite3';

const destination = process.argv[2];
if (!destination) throw new Error('Destino do snapshot não informado.');

const database = new Database(process.env.DATABASE_PATH ?? '/data/app.sqlite', {
  readonly: true
});
await database.backup(destination);
database.close();

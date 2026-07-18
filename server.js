/**
 * Servidor Atlas — Express (local + HidenCloud).
 * En Vercel, /api/spells.js atiende la API; este proceso sirve sitio + API juntos.
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleGetSpells } from './lib/spells-handler.js';
import { handleGetClassSpells } from './lib/class-spells-handler.js';
import { handleGetClasses } from './lib/classes-handler.js';
import { handleGetProgression } from './lib/progression-handler.js';
import { handleGetResources } from './lib/resources-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5180;

const app = express();

app.disable('x-powered-by');

app.all('/api/spells', (req, res) => handleGetSpells(req, res));
app.all('/api/spells/', (req, res) => handleGetSpells(req, res));
app.all('/api/class-spells', (req, res) => handleGetClassSpells(req, res));
app.all('/api/class-spells/', (req, res) => handleGetClassSpells(req, res));
app.all('/api/classes', (req, res) => handleGetClasses(req, res));
app.all('/api/classes/', (req, res) => handleGetClasses(req, res));
app.all('/api/progression', (req, res) => handleGetProgression(req, res));
app.all('/api/progression/', (req, res) => handleGetProgression(req, res));
app.all('/api/resources', (req, res) => handleGetResources(req, res));
app.all('/api/resources/', (req, res) => handleGetResources(req, res));

app.use(express.static(__dirname, {
  extensions: ['html'],
  index: 'index.html',
}));

app.use('/api', (req, res) => {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: false, error: `Ruta no encontrada: ${req.path}` }));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Atlas] http://localhost:${PORT}`);
  console.log(`[Atlas] API GET /api/spells`);
  console.log(`[Atlas] API GET /api/class-spells`);
  console.log(`[Atlas] API GET /api/classes`);
  console.log(`[Atlas] API GET /api/progression`);
  console.log(`[Atlas] API GET /api/resources`);
});

/**
 * Vercel serverless: GET /api/class-spells
 */

import { handleGetClassSpells } from '../lib/class-spells-handler.js';

export default async function handler(req, res) {
  await handleGetClassSpells(req, res);
}

/**
 * Vercel serverless: GET /api/spells
 */

import { handleGetSpells } from '../lib/spells-handler.js';

export default async function handler(req, res) {
  await handleGetSpells(req, res);
}

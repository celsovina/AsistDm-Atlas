/**
 * Vercel serverless: /api/user  (GET | POST | PUT)
 */

import { handleUser } from '../lib/user-handler.js';

export default async function handler(req, res) {
  await handleUser(req, res, 'user');
}

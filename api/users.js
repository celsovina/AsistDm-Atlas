/**
 * Vercel serverless: GET /api/users
 */

import { handleUser } from '../lib/user-handler.js';

export default async function handler(req, res) {
  await handleUser(req, res, 'users');
}

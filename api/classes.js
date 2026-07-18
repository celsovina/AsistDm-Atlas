import { handleGetClasses } from '../lib/classes-handler.js';

export default async function handler(req, res) {
  await handleGetClasses(req, res);
}

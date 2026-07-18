import { handleGetProgression } from '../lib/progression-handler.js';

export default async function handler(req, res) {
  await handleGetProgression(req, res);
}

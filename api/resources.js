import { handleGetResources } from '../lib/resources-handler.js';

export default async function handler(req, res) {
  await handleGetResources(req, res);
}

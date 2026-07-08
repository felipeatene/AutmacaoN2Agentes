import { getConfig } from '../src/utils/config.js';
import { initTeamsAdapter } from '../src/teams/client.js';

const config = getConfig();

try {
  const adapter = initTeamsAdapter(config.teams);
  console.log("Teams Adapter inicializado com sucesso.");
} catch (err) {
  console.error("Falha ao inicializar o Teams Adapter:", err.message);
}
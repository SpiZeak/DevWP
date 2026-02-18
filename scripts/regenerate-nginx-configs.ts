import { regenerateMissingNginxConfigs } from '../src/main/services/nginx';

async function run(): Promise<void> {
  const created = await regenerateMissingNginxConfigs();

  if (created.length === 0) {
    console.log('No missing nginx configs found.');
    return;
  }

  console.log(`Regenerated ${created.length} nginx configs:`);
  for (const domain of created) {
    console.log(`- ${domain}`);
  }
}

run().catch((error) => {
  console.error('Failed to regenerate nginx configs:', error);
  process.exitCode = 1;
});

import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = await createApp(config, { logger: true });
await app.server.listen({ host: config.host, port: config.port });
console.log(`\nNIFTP AI Office: http://${config.host === '::1' ? '[::1]' : config.host}:${config.port}/  （データ: ${config.dataDir}）\n`);

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    console.log('停止しています（実行中の作業は「中断」として記録されます）…');
    void app.close().then(() => process.exit(0));
  });
}

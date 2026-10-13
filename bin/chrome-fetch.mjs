#!/usr/bin/env node
import { parseConfig } from '../lib/config.mjs';
import { createApp } from '../lib/server.mjs';

const config = parseConfig(process.argv.slice(2), process.env);
const { server, startSweeper } = createApp(config);

startSweeper();

server.listen(config.port, config.host, () => {
  console.log(
    `chrome-fetch listening on ${config.host}:${config.port}, cdp ${config.cdpUrl}, ` +
      `allowed hosts: ${[...config.allowHostSet].join(', ')}`,
  );
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}

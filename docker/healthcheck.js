// Container HEALTHCHECK: succeeds when the API answers (even while setup-locked).
const http = require('node:http');

const port = process.env.RRKIT_PORT || 3000;
const req = http.get(
  { host: '127.0.0.1', port, path: '/api/health', timeout: 2000 },
  (res) => process.exit(res.statusCode === 200 ? 0 : 1),
);
req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

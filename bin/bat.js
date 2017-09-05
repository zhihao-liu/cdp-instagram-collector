'use strict';

const app = require('../app');
const http = require('http');
const appConfig = require('../config/app-config');
const logger = require('../lib/logger');
const utilities = require('../lib/utilities');

const defaultPort = appConfig.serverPortDefault;
const specifiedPort = process.argv[2];
const port = (typeof specifiedPort) !== 'undefined' ? specifiedPort : defaultPort;
const server = http.createServer(app);

server.on('error', err => logger.errorWhen('creating http server', err));

server.on('listening', async () => {
  logger.info(`Server listening on port ${port}`);

  const routes = [
    '/users',
    '/user-posts',
    '/download-post-media',
    '/download-profile-pictures',
    '/hashtagged-posts/art',
    '/located-posts/chicago'
  ];

  for (let route of routes) {
    http.get(`http://localhost:${port}${route}`);
  }

  await utilities.wait(1);
  server.close();
});

server.on('close', () => server.listen(port));

server.listen(port);
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
server.listen(port);

server.on('error', err => logger.errorWhen('creating http server', err));
server.on('listening', () => console.log(`Server listening on port ${port}`));

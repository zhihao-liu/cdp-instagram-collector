'use strict';

const Promise = require('bluebird');
const utilities = require('./lib/utilities');
const logger = require('./lib/logger');
const Mongo = require('mongodb').MongoClient();
const config = require('./config/app-config');
const login = require('./config/login-info');
const path = require('path');
const InstaCollector = require('./lib/collector')

async function main() {
  const collector = new InstaCollector(login, config);
  const collectorX = new InstaCollector(login, config);

  await Promise.all([collector.activate(), collectorX.activate()]);

  const actions = [
    collector.downloadProfilePictures(),
    collectorX.downloadPostMedia()];
  await Promise.all(actions);
}

main();
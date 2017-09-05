'use strict';

const Promise = require('bluebird');
const logger = require('../lib/logger');
const loginInfo = require('../config/login-info');
const appConfig = require('../config/app-config');
const InstaCollector = require('../lib/collector');

async function main() {
  const collector = new InstaCollector(loginInfo, appConfig);
  await collector.activate().catch(err => logger.errorWhen('activating collector', err));

  const commands = [
    collector.startDownloadingPostMedia(),
    collector.startDownloadingProfilePictures(),
    collector.startCollectingUsers(),
    collector.startCollectingUserPosts()
  ];

  return Promise.all(commands);
}

main().catch(err => logger.errorWhen('running collector', err));
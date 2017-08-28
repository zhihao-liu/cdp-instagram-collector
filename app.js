'use strict';

const app = require('express')();
const logger = require('./lib/logger');
const InstaCollector = require('./lib/collector');
const appConfig = require('./config/app-config');
const loginInfo = require('./config/login-info');

app.use('/', (req, res, next) => {
  if (!app.get('collector')) {
    app.set('collector', new InstaCollector(loginInfo, appConfig));
  }
  app.get('collector')
    .activate()
    .then(() => {
      return next();
    });
});

app.use('/start', (req, res) => {
  logger.infoWithResponse('Collector started.', res);
  const collector = app.get('collector');

  Promise.all([
    collector.startCollectingUsers(),
    collector.startCollectingUserPosts(),
    collector.startCollectingHashTaggedPosts('ottawa'),
    collector.startDownloadingPostMedia()
  ])
    .catch(err => logger.errorWhen('fetching data via collector', err));
});

app.use('/collect', (req, res) => {
  logger.infoWithResponse('Collector started.', res);
  const collector = app.get('collector');

  Promise.all([
    collector.startCollectingUsers(),
    collector.startCollectingUserPosts(),
    collector.startCollectingHashTaggedPosts('ottawa')
  ])
    .catch(err => logger.errorWhen('fetching data via collector', err));
});

app.use('/download', (req, res) => {
  logger.infoWithResponse('Collector started.', res);
  const collector = app.get('collector');

  Promise.all([
    collector.startDownloadingPostMedia()
  ])
    .catch(err => logger.errorWhen('fetching data via collector', err));
});

module.exports = app;
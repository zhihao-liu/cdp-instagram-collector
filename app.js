'use strict';

const app = require('express')();
const logger = require('./lib/logger');
const InstaCollector = require('./lib/collector');
const appConfig = require('./config/app-config');
const loginInfo = require('./config/login-info');

app.use('/', async (req, res, next) => {
  if (!app.get('collector')) {
    const collector = new InstaCollector(loginInfo, appConfig);
    await collector.activate();
    app.set('collector', collector);
  }

  return next();
});

app.use('/users', (req, res) => {
  logger.infoWithResponse(`Collecting users started.`, res);
  app.get('collector').startCollectingUsers()
    .catch(err => logger.errorWhen('starting collector for users', err));
});

app.use('/posts-new', (req, res) => {
  logger.infoWithResponse(`Collecting new posts from users started.`, res);
  app.get('collector').startCollectingPosts({historicalFirst: false})
    .catch(err => logger.errorWhen('starting collector for new posts from users', err));
});

app.use('/posts-historical', (req, res) => {
  logger.infoWithResponse(`Collecting historical posts from users started.`, res);
  app.get('collector').startCollectingPosts({historicalFirst: true})
    .catch(err => logger.errorWhen('starting collector for historical posts from users', err));
});

app.use('/posts-with-hashtag/:hashtagString', (req, res) => {
  const hashtagString = req.params.hashtagString;

  logger.infoWithResponse(`Collecting posts with hashtag ${hashtagString} started.`, res);
  app.get('collector').startCollectingPostsWithHashtag(hashtagString)
    .catch(err => logger.errorWhen('starting collector for posts with hashtag', err));
});

app.use('/posts-with-location/:locationString', (req, res) => {
  const locationString = req.params.locationString;

  logger.infoWithResponse(`Collecting posts with location ${locationString} started.`, res);
  app.get('collector').startCollectingPostsWithLocation(locationString)
    .catch(err => logger.errorWhen('starting collector for posts with location', err));
});

module.exports = app;
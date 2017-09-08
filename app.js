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
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/users-save', (req, res) => {
  logger.infoWithResponse(`Collecting users & saving profile pictures started.`, res);
  app.get('collector').startCollectingUsers({saveFiles: true})
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/posts-new', (req, res) => {
  logger.infoWithResponse(`Collecting new posts from users started.`, res);
  app.get('collector').startCollectingPosts({historicalFirst: false})
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/posts-new-save', (req, res) => {
  logger.infoWithResponse(`Collecting new posts & saving media from users started.`, res);
  app.get('collector').startCollectingPosts({historicalFirst: false, saveFiles: true})
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/posts-historical', (req, res) => {
  logger.infoWithResponse(`Collecting historical posts from users started.`, res);
  app.get('collector').startCollectingPosts({historicalFirst: true})
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/posts-historical-save', (req, res) => {
  logger.infoWithResponse(`Collecting historical posts & saving media from users started.`, res);
  app.get('collector').startCollectingPosts({historicalFirst: true, saveFiles: true})
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/download-post-media', (req, res) => {
  logger.infoWithResponse(`Downloading media of posts started.`, res);
  app.get('collector').startDownloadingPostMedia()
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/download-profile-pictures', (req, res) => {
  logger.infoWithResponse(`Downloading profile pictures of users started.`, res);
  app.get('collector').startDownloadingProfilePictures()
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/posts-with-hashtag/:hashtagString', (req, res) => {
  const hashtagString = req.params.hashtagString;

  logger.infoWithResponse(`Collecting posts with hashtag ${hashtagString} started.`, res);
  app.get('collector').startCollectingPostsWithHashtag(hashtagString)
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/posts-with-hashtag-save/:hashtagString', (req, res) => {
  const hashtagString = req.params.hashtagString;

  logger.infoWithResponse(`Collecting posts with hashtag ${hashtagString} & saving media started.`, res);
  app.get('collector').startCollectingPostsWithHashtag(hashtagString, {saveFiles: true})
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/posts-with-location/:locationString', (req, res) => {
  const locationString = req.params.locationString;

  logger.infoWithResponse(`Collecting posts with location ${locationString} started.`, res);
  app.get('collector').startCollectingPostsWithLocation(locationString)
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/posts-with-location-save/:locationString', (req, res) => {
  const locationString = req.params.locationString;

  logger.infoWithResponse(`Collecting posts with location ${locationString} & saving media started.`, res);
  app.get('collector').startCollectingPostsWithLocation(locationString, {saveFiles: true})
    .catch(err => logger.errorWhen('running collector', err));
});

module.exports = app;
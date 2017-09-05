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
    })
    .catch(err => logger.errorWhen('activating collector', err));
});

app.use('/users', (req, res) => {
  logger.infoWithResponse('Collecting users started.', res);
  const collector = app.get('collector');

  collector.startCollectingUsers()
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/user-posts', (req, res) => {
  logger.infoWithResponse('Collecting user posts started.', res);
  const collector = app.get('collector');

  collector.startCollectingUserPosts()
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/hashtagged-posts/:hashtagName', (req, res) => {
  const hashtagName = req.params.hashtagName;

  logger.infoWithResponse(`Collecting posts with hashtag "${hashtagName}" started.`, res);
  const collector = app.get('collector');

  collector.startCollectingHashTaggedPosts(req.params.hashtagName)
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/located-posts/:locationName', (req, res) => {
  const locationName = req.params.locationName;

  logger.infoWithResponse(`Collecting posts with location "${locationName}" started.`, res);
  const collector = app.get('collector');

  collector.startCollectingLocatedPosts(locationName)
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/download-post-media', (req, res) => {
  logger.infoWithResponse('Downloading post media started.', res);
  const collector = app.get('collector');

  collector.startDownloadingPostMedia()
    .catch(err => logger.errorWhen('running collector', err));
});

app.use('/download-profile-pictures', (req, res) => {
  logger.infoWithResponse('Downloading user profile pictures started.', res);
  const collector = app.get('collector');

  collector.startDownloadingProfilePictures()
    .catch(err => logger.errorWhen('fetching data via collector', err));
});

module.exports = app;
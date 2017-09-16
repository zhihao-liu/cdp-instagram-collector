'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const logger = require('./lib/logger');
const InstaCollector = require('./lib/collector');
const appConfig = require('./config/app-config');
const loginInfo = require('./config/login-info');

const app = express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/start', async (req, res) => {
  // console.log(req.body);

  let message = '';

  if(req.body.mediaStoragePath !== '') appConfig.mediaStoragePath = req.body.mediaStoragePath;

  const collector = new InstaCollector(loginInfo, appConfig);

  await collector.activate();

  if(req.body.collectUsers === 'on') {
    collector.startCollectingUsers()
    .catch(err => logger.errorWhen('starting collector for users', err));

    message += '\nCollecting users started.';
  };

  if(req.body.collectPosts === 'on') {
    const historicalOnly = req.body.optionCollectPosts === 'historical' ? true : false;
    collector.startCollectingPosts({historicalOnly: historicalOnly})
    .catch(err => logger.errorWhen('starting collector for new posts from users', err));

    message += `\nCollecting ${req.body.optionCollectPosts} posts started.`;
  }

  if(req.body.collectHashtagPosts === 'on') {
    const specifiedHashtags = req.body.specifiedHashtags.split(',');

    for (let hashtag of specifiedHashtags) {
      hashtag = hashtag.trim();
      collector.startCollectingPostsWithHashtag(hashtag)
      .catch(err => logger.errorWhen(`starting collector for posts with hashtag "${hashtag}"`, err));

      message += `\nCollecting posts with hashtag "${hashtag}" started.`;
    }
  }

  if(req.body.collectLocationPosts === 'on') {
    const specifiedLocations = req.body.specifiedLocations.split(',');

    for (let location of specifiedLocations) {
      location = location.trim();
      collector.startCollectingPostsWithHashtag(location)
      .catch(err => logger.errorWhen(`starting collector for posts with location "${location}"`, err));

      message += `\nCollecting posts with location "${location}" started.`;
    }
  }

  console.log(message);

  res.status(200).send('Collector started.');
});

// app.use('/', async (req, res, next) => {
//   if (!app.get('collector')) {
//     const collector = new InstaCollector(loginInfo, appConfig);
//     await collector.activate();
//     app.set('collector', collector);
//   }
//
//   return next();
// });
//
// app.use('/users', (req, res) => {
//   logger.infoWithResponse(`Collecting users started.`, res);
//   app.get('collector').startCollectingUsers()
//   .catch(err => logger.errorWhen('starting collector for users', err));
// });
//
// app.use('/posts-new', (req, res) => {
//   logger.infoWithResponse(`Collecting new posts from users started.`, res);
//   app.get('collector').startCollectingPosts({historicalOnly: false})
//   .catch(err => logger.errorWhen('starting collector for new posts from users', err));
// });
//
// app.use('/posts-historical', (req, res) => {
//   logger.infoWithResponse(`Collecting historical posts from users started.`, res);
//   app.get('collector').startCollectingPosts({historicalOnly: true})
//   .catch(err => logger.errorWhen('starting collector for historical posts from users', err));
// });
//
// app.use('/posts-with-hashtag/:hashtagString', (req, res) => {
//   const hashtagString = req.params.hashtagString;
//
//   logger.infoWithResponse(`Collecting posts with hashtag ${hashtagString} started.`, res);
//   app.get('collector').startCollectingPostsWithHashtag(hashtagString)
//   .catch(err => logger.errorWhen('starting collector for posts with hashtag', err));
// });
//
// app.use('/posts-with-location/:locationString', (req, res) => {
//   const locationString = req.params.locationString;
//
//   logger.infoWithResponse(`Collecting posts with location ${locationString} started.`, res);
//   app.get('collector').startCollectingPostsWithLocation(locationString)
//   .catch(err => logger.errorWhen('starting collector for posts with location', err));
// });

module.exports = app;

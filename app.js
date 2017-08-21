'use strict';

const Promise = require('bluebird');
const express = require('express');
const _ = require('underscore');
const log4js = require('log4js');
const Mongo = require('mongodb').MongoClient();
const Instagram = require('instagram-private-api').V1;
const login = require('./config/login');
const appConfig = require('./config/app-config');

const app = express();

const date = new Date();
const dateString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

log4js.configure({
  appenders: {
    console: {type: 'console'},
    file: {type: 'file', filename: `logs/${dateString}.log`}
  },
  categories: {
    default: {appenders: ['console', 'file'], level: 'info'}
  }
});
const logger = log4js.getLogger();


// connect to MongoDB
app.use('/', (req, res, next) => {
  if (app.get('pMongo')) return next(); // connection already exists

  logger.info('Connecting to MongoDB...');

  const connectionUrl = 'mongodb://localhost:27017/instagram';
  const pMongo = Mongo.connect(connectionUrl);
  pMongo.catch(err => logError('connecting to MongoDB', err));

  app.set('pMongo', pMongo);
  return next();
});


// initialize collections in MongoDB
app.use('/dbinit', (req, res) => {
  logger.info('Initializing MongoDB collections...');

  const pMongo = app.get('pMongo');
  pMongo.then(mongo => {
    Promise.all([
      createCollectionWithUniqueIndex(mongo, 'users'),
      createCollectionWithUniqueIndex(mongo, 'posts')
    ])
      .catch(err => logError('initializing MongoDB collections', err));
  });

  logAndSend(logger, res, 'MongoDB sucessfully initialized.');
});


// create Instagram session before collecting
app.use('/collect', (req, res,next) => {
  if (app.get('pSession')) return next(); // session already exists

  logger.info('Creating Instagram session...');

  const device = new Instagram.Device(login.username);
  const cookie = new Instagram.CookieMemoryStorage();
  const pSession = Instagram.Session.create(device, cookie, login.username, login.password)
  pSession.catch(err => logError('creating Instagram session', err));

  app.set('pSession', pSession);
  return next();
});


// fetch data of users based on followers of influencer
app.use('/collect/users', (req, res) => {
  logAndSend(logger, res, 'Fetching data of users...');

  const pSession = app.get('pSession');
  const pMongo = app.get('pMongo');

  // search for pInfluencer (e.g. Instagram Official Account)
  const pInfluencer = pSession.then(session => {
    const influencerUsername = 'instagram';
    return Instagram.Account.searchForUser(session, influencerUsername);
  });
  pInfluencer.catch(err => logError('searching for influencer', err));

  // create feed of users (followers of pInfluencer)
  const pUserFeed = Promise.all([pSession, pInfluencer]).then(([session, influencer]) => {
    return new Instagram.Feed.AccountFollowers(session, influencer.params.id);
  });

  // fetch data from feed of users
  Promise.all([pUserFeed, pMongo]).then(([userFeed, mongo]) => {
    return fetchFeedData(userFeed, mongo.collection('users'), {showMessage: true});
  })
    .then(() => logger.info('Fetching feed data of users finished'));
});


// fetch data of posts of users whose info have already been stored in MongoDB
app.use('/collect/user-posts', (req, res) => {
  logAndSend(logger, res, 'Fetching data of user posts...');

  const pSession = app.get('pSession');
  const pMongo = app.get('pMongo');

  let pAllUsersHandled = [];

  Promise.all([pSession, pMongo]).then(async ([session, mongo]) => {
    const cursorCollectionUsers = mongo.collection('users')
      .find({datesFetched: {$nin: [dateString]}, 'info.isPrivate': false});

    while(await cursorCollectionUsers.hasNext()) {
      try {
        const item = await cursorCollectionUsers.next();
        const postFeed = new Instagram.Feed.UserMedia(session, item.info.id);
        pAllUsersHandled.push(
          fetchFeedData(postFeed, mongo.collection('posts'))
            .then(() => {
              let datesFetched = (typeof item.datesFetched) !== 'undefined' ? item.datesFetched : [];
              datesFetched.push(dateString);
              // mark user whose posts for today have been fetched
              mongo.collection('users').updateOne({'info.id': item.info.id}, {$set: {datesFetched: datesFetched}})
                .catch(err => logError('marking user whose posts completed', err));
            })
        );
      }
      catch (err) {
        logError('retrieving user info from MongoDB', err);
      }
    }

    Promise.all(pAllUsersHandled).then(() => logger.info('Posts fetched of all users currently in MongoDB.'))
  });
});


// fetch data of posts with a given hashtag
app.use('/collect/hashtagged-posts/:hashtag', (req, res) => {
  const hashtag = req.params.hashtag;

  logAndSend(logger, res, `Fetching data of posts with hashtag "${hashtag}"...`);

  const pSession = app.get('pSession');
  const pMongo = app.get('pMongo');

  const pPostFeed = pSession.then(session => {
    return new Instagram.Feed.TaggedMedia(session, hashtag);
  });

  Promise.all([pPostFeed, pMongo]).then(([postFeed, mongo]) => {
    return fetchFeedData(postFeed, mongo.collection(`posts`), {showMessage: true});
  })
    .then(() => logger.info(`Fetching feed data of hashtag "${hashtag}" finished`));
});


// fetch data of posts with a given location
app.use('/collect/located-posts/:locationName', (req, res) => {
  const locationName = req.params.locationName;

  const pSession = app.get('pSession');
  const pMongo = app.get('pMongo');

  const pLocation = pSession.then(session => {
    return Instagram.Location.search(session, locationName)
      .then(locationResults => locationResults[0]);
  });
  pLocation.catch(err => logError('searching for location', err));
  pLocation.then(location => {
    logAndSend(logger, res, `Fetching data of posts with location "${location.params.title}"...`);

    const pPostFeed = pSession.then(session => {
      return new Instagram.Feed.LocationMedia(session, location.params.id);
    });

    Promise.all([pPostFeed, pMongo]).then(([postFeed, mongo]) => {
      return fetchFeedData(postFeed, mongo.collection(`posts`), {showMessage: true});
    })
      .then(() => logger.info(`Fetching feed data of location "${location.params.title}" finished`));
  });
});


// download media using URLs stored in MongoDB
app.use('/download', (req, res) => {
  logAndSend(logger, res, 'Coming soon...');

  // to be developed...
});


app.listen(appConfig.port);
logger.info(`Server listening on port ${appConfig.port}`);


// iterate data of given feed and push them into MongoDB
async function fetchFeedData(feed, mongoCollection, options) {
  options = (typeof options) !== 'undefined' ? options : {};
  const limit = (typeof options.limit) !== 'undefined' ? options.limit : Infinity;
  const showMessage = (typeof options.showMessage) !== 'undefined' ? options.showMessage : false;

  let pAllPagesHandled = [];
  let countItemsFetched = 0;
  const sleepDuration = 5; // put fetching function to sleep for serveral minutes if request failed

    do {
      if (countItemsFetched >= limit) break;

      try {
        const nextPage = _.flatten(await feed.get());
        pAllPagesHandled.push(
          pushIntoMongo(nextPage, mongoCollection)
            .then(() => countItemsFetched += nextPage.length)
            .catch(err => {
              // docs with duplicate key cannot be successfully inserted
              // thus repeatitions will be ignored
              const ignorableErrors = ['MongoError: E11000 duplicate key'];
              if (!errorInList(err, ignorableErrors)) logError('inserting docs into MongoDB', err);
            })
        );
      } catch (err) {
        // The message of error to be handled as putting function to sleep:
        // "RequestError: Please wait a few minutes before you try again."
        const ignorableErrors = ['PrivateUserError'];

        if (showMessage && !errorInList(err, ignorableErrors)) logError(`iterating feed data of ${mongoCollection.s.name}`, err);

        if (errorInList(err, ['RequestError: Please wait a few minutes'])) {
          if (showMessage) logger.info(`Fetching feed data of ${mongoCollection.s.name} put to sleep for ${sleepDuration} minutes...`);
          await sleep(sleepDuration);
        }
      }
    } while (feed.isMoreAvailable());

    return Promise.all(pAllPagesHandled);
}


// create unique index to avoid duplicate docs
function createCollectionWithUniqueIndex(mongo, collectionName) {
  return mongo.createCollection(collectionName)
    .then(collection => collection.createIndex({'info.id': 1}, {unique: true}));
}


// push the "params" property of each array item into MongoDB
function pushIntoMongo(array, mongoCollection) {
  let pAllItemsHandled = [];
  for (const item of array) {
    pAllItemsHandled.push(mongoCollection.update({id: item.params.id}, {$set: {info: item.params}}, {upsert: true}));
  }

  return Promise.all(pAllItemsHandled);
}


// show status code and message of error and where it happens
function logError(occasion, err) {
  logger.error(`Error when ${occasion}: ${err}`);
}


// put asynchronous function to sleep
function sleep(minutes) {
  return new Promise((resolve) => setTimeout(resolve, minutes * 60 * 1000));
}


// ignore some known errors in console log
function errorInList(err, knownErrors) {
  for (const item of knownErrors) {
    if (err.toString().substr(0, item.length) === item) return true;
  }

  return false;
}


// log message and send it as response
function logAndSend(logger, res, message) {
  logger.info(message);
  res.status(200);
  res.send(message);
}
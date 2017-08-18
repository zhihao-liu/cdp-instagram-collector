'use strict';

const express = require('express');
const Promise = require('bluebird');
const _ = require('underscore');
const Mongo = require('mongodb').MongoClient();
const Instagram = require('instagram-private-api').V1;
const login = require('./config/login');
const appConfig = require('./config/app-config');

const app = express();

// connect to MongoDB
app.use('/', (req, res, next) => {
  if (app.get('mongo')) next(); // MongoDB is already connected to

  console.log('Connecting to MongoDB...');

  const connectionUrl = 'mongodb://localhost:27017/instagram';
  const pMongo = Mongo.connect(connectionUrl);
  pMongo.catch(err => logError('connecting to MongoDB', err));

  app.set('pMongo', pMongo);
  next();
});

// initialize collections in MongoDB
app.use('/dbinit', (req, res) => {
  console.log('Initializing MongoDB collections...');

  const pMongo = app.get('pMongo');
  pMongo.then(mongo => {
    Promise.all([
      createCollectionWithUniqueIndex(mongo, 'users'),
      createCollectionWithUniqueIndex(mongo, 'posts')
    ])
      .catch(err => logError('initializing MongoDB collections', err));
  });

  res.status(200);
  res.send('MongoDB sucessfully initialized.');
});

// create Instagram session before collecting
app.use('/collect', (req, res,next) => {
  console.log('Creating Instagram session...');

  const device = new Instagram.Device(login.username);
  const cookie = new Instagram.CookieMemoryStorage();
  const pSession = Instagram.Session.create(device, cookie, login.username, login.password)
  pSession.catch(err => logError('creating Instagram session', err));

  app.set('pSession', pSession);
  next();
});

// fetch data of users based on followers of influencer
app.use('/collect/users', (req, res) => {
  res.status(200);
  res.send('Fetching data of users...');
  console.log('Fetching data of users...');

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
    .then(() => console.log('Fetching feed data of users finished'));;
});

// fetch data of posts of users whose info have already been stored in MongoDB
app.use('/collect/posts', async (req, res) => {
  res.status(200);
  res.send('Fetching data of posts...');
  console.log('Fetching data of posts...');

  const pSession = app.get('pSession');
  const pMongo = app.get('pMongo');

  const dateToday = new Date();
  let pAllUsersHandled = [];

  Promise.all([pSession, pMongo]).then(async ([session, mongo]) => {
    const cursorCollectionUsers = mongo.collection('users')
      .find({'datesFetched': {'$nin': [dateToday]}, 'isPrivate': false});

    while(await cursorCollectionUsers.hasNext()) {
      try {
        const item = await cursorCollectionUsers.next();
        const postFeed = new Instagram.Feed.UserMedia(session, item.id);
        pAllUsersHandled.push(
          fetchFeedData(postFeed, mongo.collection('posts'))
            .then(() => {
              let datesFetched = (typeof item.datesFetched) !== 'undefined' ? item.datesFetched : [];
              datesFetched.push(dateToday);
              // mark user whose posts for today have been fetched
              mongo.collection('users').updateOne({'id': item.id}, {'$set': {'datesFetched': datesFetched}})
                .catch(err => logError('marking user whose posts completed', err));
            })
        );
      }
      catch (err) {
        logError('retrieving user info from MongoDB', err);
      }
    }

    // cursorCollectionUsers.forEach(item => {
    //   const postFeed = new Instagram.Feed.UserMedia(session, item.id);
    //
    //   pAllUsersHandled.push(
    //     fetchFeedData(postFeed, mongo.collection('posts'))
    //       .then(() => {
    //         let datesFetched = (typeof item.datesFetched) !== 'undefined' ? item.datesFetched : [];
    //         datesFetched.push(dateToday);
    //         // mark user whose posts for today have been fetched
    //         mongo.collection('users').updateOne({'id': item.id}, {'$set': {'datesFetched': datesFetched}})
    //           .catch(err => logError('marking user whose posts completed', err));
    //       })
    //   );
    // }, err => {
    //   if (err) logError('iterating "users" in MongoDB', err);
    // });

    Promise.all(pAllUsersHandled).then(() => console.log('Posts fetched of all users currently in MongoDB.'))
  });
});

app.listen(appConfig.port);
console.log(`Server listening on port ${appConfig.port}`);

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
          pushArrayItemParamsIntoMongo(nextPage, mongoCollection)
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
          if (showMessage) console.log(`Fetching feed data of ${mongoCollection.s.name} put to sleep for ${sleepDuration} minutes...`);
          await sleep(sleepDuration);
        }
      }
    } while (feed.isMoreAvailable());

    return Promise.all(pAllPagesHandled);
}

// create unique index to avoid duplicate docs
function createCollectionWithUniqueIndex(mongo, collectionName) {
  return mongo.createCollection(collectionName)
    .then(collection => collection.createIndex({id: 1}, {unique: true}));
}

// push the "params" property of each array item into MongoDB
function pushArrayItemParamsIntoMongo(array, mongoCollection) {
  let pAllItemsHandled = [];
  for (const item of array) pAllItemsHandled.push(mongoCollection.insertOne(item.params));

  return Promise.all(pAllItemsHandled);
}

// show status code and message of error and where it happens
function logError(occasion, err) {
  console.log(`Error when ${occasion}: ${err}`);
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
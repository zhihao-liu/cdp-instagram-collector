'use strict';

const express = require('express');
const Promise = require('bluebird');
const _ = require('underscore');
const Mongo = require('mongodb').MongoClient();
const Instagram = require('instagram-private-api').V1;
const login = require('./config/login');
const appConfig = require('./config/app-config');

const app = express();

app.use('/', (req, res, next) => {
  if (app.get('mongo')) next(); // MongoDB is already connected to

  console.log(`Connecting to MongoDB...`);

  const connectionUrl = 'mongodb://localhost:27017/instagram';
  const mongo = Mongo.connect(connectionUrl);
  mongo.catch(err => logError(`connecting to MongoDB`, err));

  app.set('mongo', mongo)
  next();
});

app.use('/dbinit', (req, res, next) => {
  console.log(`Initializing MongoDB collections...`);

  const mongo = app.get('mongo');
  mongo.then(mongo => {
    Promise.all([
      createCollectionWithUniqueIndex(mongo, 'users'),
      createCollectionWithUniqueIndex(mongo, 'posts')
    ])
      .catch(err => logError(`initializing MongoDB collections`, err));
  });

  res.status(200);
  res.send(`MongoDB sucessfully initialized.`);
});

app.use('/collect', (req, res,next) => {
  console.log(`Creating Instagram session...`);

  const device = new Instagram.Device(login.username);
  const cookie = new Instagram.CookieFileStorage('./cookies/' + login.username + '.json');
  const session = Instagram.Session.create(device, cookie, login.username, login.password)
  session.catch(err => logError(`creating Instagram session`, err));

  app.set('session', session);
  next();
});

app.use('/collect/users', async (req, res) => {
  console.log(`Fetching data of users...`);

  res.status(200);
  res.send(`Fetching data of users...`);

  const session = app.get('session');
  const mongo = app.get('mongo');

  // search for influencer (e.g. Instagram Official Account)
  const influencer = session.then(session => {
    const influencerUsername = 'instagram';
    return Instagram.Account.searchForUser(session, influencerUsername);
  });
  influencer.catch(err => logError(`searching for influencer`, err));

  // create feed of users (followers of influencer)
  const userFeed = Promise.all([session, influencer]).then(([session, influencer]) => {
    return new Instagram.Feed.AccountFollowers(session, influencer.params.id);
  });
  userFeed.catch(err => logError(`creating feed of users`, err));

  // fetch data from feed of users
  Promise.all([userFeed, mongo]).then(([userFeed, mongo]) => {
    fetchFeedData(userFeed, mongo.collection('users'))
      .then(() => console.log(`Fetching feed data of users finished`));
  });

  app.set('influencer', influencer);
  app.set('userFeed', userFeed);
});

app.listen(appConfig.port);
console.log(`Server listening on port ${appConfig.port}`);

async function fetchFeedData(feed, mongoCollection) {
  let allPagesHandled = [];
  const sleepDuration = 5; // put fetching function to sleep for serveral minutes if request failed

    do {
      try {
        const nextPage = _.flatten(await feed.get());
        allPagesHandled.push(
          pushItemParamsIntoMongo(nextPage, mongoCollection)
            .then(() => {
              // set cursor here
            })
            // docs with duplicate key cannot be successfully inserted
            // thus repeatitions will be ignored
            .catch(err => {
              // logError(`inserting documents into "${mongoCollection.s.name}"`, err)
            })
        );
      } catch (err) {
        // The message of error to be handled: "RequestError: Please wait a few minutes before you try again."
        // The code of error to be handled: undefined
        logError(`iterating feed data of ${mongoCollection.s.name}`, err);

        console.log(`Fetching feed data of ${mongoCollection.s.name} put to sleep for ${sleepDuration} minutes...`);
        await sleep(sleepDuration);
      }
    } while (feed.isMoreAvailable());

    return Promise.all(allPagesHandled);
}

function pushItemParamsIntoMongo(array, mongoCollection) {
  let allItemsHandled = [];
  for (const item of array) allItemsHandled.push(mongoCollection.insertOne(item.params));

  return Promise.all(allItemsHandled);
}

// show the status code and message of error and where it happens
function logError(occasion, err) {
  console.log(`Error when ` + occasion + `: (${err.status}) ${err}`);
}

function createCollectionWithUniqueIndex(mongo, collectionName) {
  return mongo.createCollection(collectionName)
    .then(collection => collection.createIndex({id: 1}, {unique: true}));
}

function sleep(minutes) {
  return new Promise((resolve) => setTimeout(resolve, minutes * 60 * 1000));
}
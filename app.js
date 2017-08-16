'use strict';

const express = require('express');
const Promise = require('bluebird');
const _ = require('underscore');
const Mongo = require('mongodb').MongoClient();
const Instagram = require('instagram-private-api').V1;
const login = require('./config/login');
const appConfig = require('./config/app-config');

const app = express();

app.use('/collect', (req, res, next) => {
  // connect to MongoDB
  const connectionUrl = 'mongodb://localhost:27017/instagram';
  const mongo = Mongo.connect(connectionUrl);
  mongo.catch(err => console.log(`Error when connecting to MongoDB: ${statusAndMessage(err)}`));

  // create session
  const device = new Instagram.Device(login.username);
  const cookie = new Instagram.CookieFileStorage('./cookies/' + login.username + '.json');
  const session = Instagram.Session.create(device, cookie, login.username, login.password)
  session.catch(err => console.log(`Error when creating session: ${statusAndMessage(err)}`));

  app.set('mongo', mongo)
  app.set('session', session);
  next();
});

app.use('/collect/users', async (req, res) => {
  res.status(200);
  res.send('Fetching data of users...');

  const session = app.get('session');
  const mongo = app.get('mongo');

  // search for influencer (e.g. Instagram Official Account)
  const influencer = session.then(session => {
    const influencerUsername = 'instagram';
    return Instagram.Account.searchForUser(session, influencerUsername);
  });
  influencer.catch(err => console.log(`Error when searching for influencer: ${statusAndMessage(err)}`));

  // create feed of users (followers of influencer)
  const userFeed = Promise.all([session, influencer]).then(([session, influencer]) => {
    return new Instagram.Feed.AccountFollowers(session, influencer.params.id);
  });
  userFeed.catch(err => console.log(`Error when creating feed of users: ${statusAndMessage(err)}`));

  // fetch data from feed of users
  Promise.all([userFeed, mongo]).then(([userFeed, mongo]) => {
    iterateFeed(userFeed, mongo.collection('users'))
      .catch(err => console.log(`Error when iterating feed of users: ${statusAndMessage(err)}`));
  });

  app.set('influencer', influencer);
  app.set('userFeed', userFeed);
});

app.listen(appConfig.port);
console.log(`Server listening on port ${appConfig.port}`);

async function iterateFeed(feed, mongoCollection) {
  let allPagesPushed = [];
  // let countPagePushed = 0;

  try {
    do {
      const nextPage = _.flatten(await feed.get());

      const pagePushed = pushItemParamsIntoMongo(nextPage, mongoCollection);
      // pagePushed.then(() => console.log(`Data of ${++countPagePushed} page fetched.`));
      allPagesPushed.push(pagePushed);
    } while (feed.isMoreAvailable());

    return Promise.all(allPagesPushed);
  } catch (err) {
    // The message of error to be handled: "RequestError: Please wait a few minutes before you try again."
    // The code of error to be handled: undefined
    return Promise.reject(err);
  }
}

function pushItemParamsIntoMongo(array, mongoCollection) {
  let allItemsPushed = [];
  for (const item of array) {
    const itemPushed = mongoCollection.insertOne(item.params);
    allItemsPushed.push(itemPushed);
  }
  return Promise.all(allItemsPushed);
}

// show the status code and message of error
function statusAndMessage(err) {
  return `(${err.status}) ${err}`;
}
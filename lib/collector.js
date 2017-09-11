'use strict';

const Promise = require('bluebird');
const _ = require('underscore');
const path = require('path');
const Mongo = require('mongodb').MongoClient();
const Instagram = require('instagram-private-api').V1;
const Buffer = require('./buffer');
const logger = require('./logger');
const utilities = require('./utilities');

const InstaCollector = function (loginInfo, config) {
  this.loginInfo = loginInfo;
  this.config = config;

  this.session = null;
  this.mongo = null;
  this.buffer = [];
};

InstaCollector.emptyFilter = function (key) {
  return {
    $or: [
      {[key]: {$exists: false}},
      {[key]: null},
      {[key]: undefined}
    ]
  };
};

InstaCollector.prototype.activate = async function () {
  if (this.session === null) this.session = await this.createInstaSession();
  if (this.mongo === null) this.mongo = await this.connectToMongo();

  if (this.mongo.listCollections({}).toArray().length < 2) await this.initializeMongoCollections();

  this.buffer = {};
  for (const collection of ['users', 'posts']) {
    this.buffer[collection] = new Buffer(
      this.mongo.collection(collection),
      this.config.srcPath[collection],
      this.config.bufferSize[collection]
    );
  }
};

InstaCollector.prototype.connectToMongo = function () {
  const connectionUrl = `mongodb://localhost:${this.config.mongoPortDefault}/${this.config.mongoName}`;
  return Mongo.connect(connectionUrl);
};

InstaCollector.createIndexedCollection = (mongo, collectionName) => {
  return mongo.createCollection(collectionName)
    .then(collection => collection.ensureIndex({'info.id': 1}, {unique: true}));
};

InstaCollector.prototype.initializeMongoCollections = function () {
  return Promise.all([
    InstaCollector.createIndexedCollection(this.mongo, 'users'),
    InstaCollector.createIndexedCollection(this.mongo, 'posts')
  ])
};

InstaCollector.prototype.createInstaSession = function () {
  const device = new Instagram.Device(this.loginInfo.username);
  const cookie = new Instagram.CookieMemoryStorage();
  return Instagram.Session.create(device, cookie, this.loginInfo.username, this.loginInfo.password);
};

// iterate data of given feed and push them into MongoDB
InstaCollector.prototype.iterateFeed = async function (feed, collectionName, options) {
  options = typeof options !== 'undefined' ? options : {};
  options.limit = typeof options.limit !== 'undefined' ? options.limit : Infinity;

  let pAllPagesHandled = [];
  let countItemsFetched = 0;

  do {
    if (countItemsFetched >= options.limit) break;

    try {
      const nextPage = _.flatten(await feed.get());
      for (const item of nextPage) await this.buffer[collectionName].push(item.params);
      countItemsFetched += nextPage.length
    } catch (err) {
      // The message of errorWhen to be handled as putting function to sleep:
      // "RequestError: Please wait a few minutes before you try again."
      const ignorableErrors = [
        'MongoError: E11000 duplicate key',
        'MongoError: connection',
        'PrivateUserError',
        'RequestError: Error: socket hang up',
        'RequestError: Error: connect EADDRINUSE',
        'RequestError: Error: connect ENOBUFS',
        'RequestError: read ECONNRESET',
        'Error: read ECONNRESET'
      ];

      if (!utilities.errorInList(err, ignorableErrors)) logger.errorWhen(`iterating feed data of ${collectionName}`, err);

      // If request is rejected because the user becomes private,
      // update the information of the user in collection "users".
      if (utilities.errorInList(err, ['PrivateUserError'])) {
        this.mongo.collection('users')
          .updateOne({'info.id': feed.accountId}, {$set: {'info.isPrivate': true}})
          .catch(err => logger.errorWhen('update privativity status of users', err));
      }

      if (utilities.errorInList(err, ['RequestError: Please wait a few minutes'])) {
        await utilities.wait(this.config.sleepDuration); // put fetching function to sleep for serveral minutes if request failed
      }
    }
  } while (feed.isMoreAvailable());
};

/* @deprecated */
InstaCollector.prototype.downloadPostMedia = async function () {
  const cursorCollectionPosts = this.mongo.collection('posts')
    .find(InstaCollector.emptyFilter('src'));

  while (await cursorCollectionPosts.hasNext()) {
    try {
      const item = await cursorCollectionPosts.next();
      const srcNames = await this.saveFiles(item.info);

      await this.mongo.collection('posts')
        .updateOne({'info.id': item.info.id}, {$set: {src: srcNames}});
    } catch (err) {
      InstaCollector.onErrorDownloading(err);
    }
  }
};

/* @deprecated */
InstaCollector.prototype.downloadProfilePictures = async function () {
  const cursorCollectionPosts = this.mongo.collection('users')
    .find(InstaCollector.emptyFilter('src'));

  while (await cursorCollectionPosts.hasNext()) {
    try {
      const item = await cursorCollectionPosts.next();
      const srcName = await this.saveFiles(item.info);

      await this.mongo.collection('users')
        .updateOne({'info.id': item.info.id}, {$set: {src: srcName}});
    } catch (err) {
      InstaCollector.onErrorDownloading(err);
    }
  }
};

InstaCollector.prototype.collectUserPosts = async function (options) {
  options = typeof options !== 'undefined' ? options : {};
  options.historicalFirst = typeof options.historicalFirst !== 'undefined' ? options.historicalFirst : false;

  const dateStringToday = utilities.dateStringToday();

  const query = options.historicalFirst ?
    InstaCollector.emptyFilter('datesFetched') : {datesFetched: {$nin: [dateStringToday]}};
  query['info.isPrivate'] = false;

  const cursorCollectionUsers = this.mongo.collection('users').find(query);
  // let pAllUsersHandled = [];

  while (await cursorCollectionUsers.hasNext()) {
    try {
      const item = await cursorCollectionUsers.next();
      const limit = typeof item.datesFetched === 'undefined' ? Infinity : this.config.numUserPostsPerDay;
      const postFeed = await new Instagram.Feed.UserMedia(this.session, item.info.id);

      // pAllUsersHandled.push(
        await this.iterateFeed(postFeed, 'posts', options)
          .then(() => {
            let datesFetched = typeof item.datesFetched !== 'undefined' ? item.datesFetched : [];
            datesFetched.push(dateStringToday);
            // mark user whose posts for today have been fetched
            return this.mongo.collection('users').updateOne({'info.id': item.info.id}, {$set: {datesFetched: datesFetched}})
          })
          .catch(err => {
            const ignorableErrors = [
              'MongoError: connection'
            ];
            if (!utilities.errorInList(err, ignorableErrors)) {
              logger.errorWhen(`fetching data of user "${item.info.username}"`, err);
            }
          });
      // );

      // if (pAllUsersHandled.length > this.config.numUsersInProgress) {
      //   await pAllUsersHandled;
      //   pAllUsersHandled.length = 0;
      // }
    }
    catch (err) {
      logger.errorWhen('retrieving user info from MongoDB', err);
    }
  }
};

/* @deprecated */
InstaCollector.prototype.startDownloadingPostMedia = async function () {
  while (true) await this.downloadPostMedia();
};

/* @deprecated */
InstaCollector.prototype.startDownloadingProfilePictures = async function () {
  while (true) await this.downloadProfilePictures();
};

InstaCollector.prototype.startCollectingUsers = async function () {
  // search for influencer (e.g. Instagram Official Account)
  const influencerUsername = 'instagram';
  const influencerAccount = await Instagram.Account.searchForUser(this.session, influencerUsername);

  // create feed of users (followers of pInfluencer)
  const userFeed = await new Instagram.Feed.AccountFollowers(this.session, influencerAccount.params.id);

  // fetch data from feed of users
  while (true) await this.iterateFeed(userFeed, 'users');
};

InstaCollector.prototype.startCollectingPosts = async function (options) {
  while (true) await this.collectUserPosts(options);
};

InstaCollector.prototype.startCollectingPostsWithHashtag = async function (hashtagString, options) {
  const postFeed = await new Instagram.Feed.TaggedMedia(this.session, hashtagString);
  while (true) await this.iterateFeed(postFeed, 'posts', options);
};

InstaCollector.prototype.startCollectingPostsWithLocation = async function (locationString, options) {
  let location;
  try {
    location = await Instagram.Location.search(this.session, locationString)
      .then(locationResults => locationResults[0]);
  } catch (err) {
    logger.errorWhen(`searching for location ${locationString}`, err);
    return;
  }

  const postFeed = await new Instagram.Feed.LocationMedia(this.session, location.params.id);
  while (true) await this.iterateFeed(postFeed, 'posts', options);
};

module.exports = InstaCollector;
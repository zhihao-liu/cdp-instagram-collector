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

InstaCollector.prototype.activate = async function () {
  if (this.session === null) this.session = await this.createInstaSession();
  if (this.mongo === null) this.mongo = await this.connectToMongo();

  if (this.mongo.listCollections({}).toArray().length < 2) await this.initializeMongoCollections();

  this.buffer = {};
  for (const collection of ['users', 'posts']) {
    this.buffer[collection] = new Buffer(
      this.mongo.collection(collection),
      this.config.srcDir[collection],
      this.config.bufferSize[collection]
      );
  }

  return this;
};

InstaCollector.prototype.connectToMongo = function () {
  return Mongo.connect(this.config.mongoConnectionUrl);
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
      for (const item of nextPage) {
        await this.buffer[collectionName].push(item.params, {saveFiles: this.config.saveMediaToLocal});
      }
      countItemsFetched += nextPage.length
    } catch (err) {
      // The message of errorWhen to be handled as putting function to sleep:
      // "RequestError: Please wait a few minutes before you try again."

      if (!utilities.errorInList(err, [
        'MongoError: connection',
        'PrivateUserError',
        'RequestError'
        ])) {
        logger.errorWhen(`iterating feed data of ${collectionName}`, err);
    }

      // if request is rejected because the user becomes private
      // update the information of the user in collection "users"
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
  .find({src: null});

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
  .find({src: null});

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
  options.historicalOnly = typeof options.historicalOnly !== 'undefined' ? options.historicalOnly : false;;

  const query = options.historicalOnly ? {datesFetched: null} : {datesFetched: {$nin: [dateStringToday]}};
  query['info.isPrivate'] = false;

  const cursorUsers = this.mongo.collection('users').find(query);

  // error may be thrown here
  // cursor could be lost due to mongo connection lost
  // handle it ouside this function
  while (await cursorUsers.hasNext()) {
    const item = await cursorUsers.next();
    // logger.info(`Start collecting user with id "${item.info.id}"`);

    try {
      const limit = typeof item.datesFetched === 'undefined' ? Infinity : this.config.numUserPostsPerDay;
      const postFeed = await new Instagram.Feed.UserMedia(this.session, item.info.id);

      let datesFetched = typeof item.datesFetched !== 'undefined' ? item.datesFetched : [];
      datesFetched.push(utilities.dateStringToday());

      await this.iterateFeed(postFeed, 'posts', options)
      await this.mongo.collection('users').updateOne({'info.id': item.info.id}, {$set: {datesFetched: datesFetched}})

      // logger.info(`Finish collecting user with id "${item.info.id}"`);
    } catch (err) {
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
  while (true) {
    try {
      await this.iterateFeed(userFeed, 'users');
    } catch (err) {
      logger.errorWhen('running collector for users', err)
    }
  }
};

InstaCollector.prototype.startCollectingPosts = async function (options) {
  while (true) {
    try {
      await this.collectUserPosts(options);
    } catch (err) {
      logger.errorWhen('running collector for posts from users', err)
    }
  }
};

InstaCollector.prototype.startCollectingPostsWithHashtag = async function (hashtagString, options) {
  try{
    const postFeed = await new Instagram.Feed.TaggedMedia(this.session, hashtagString);

    while (true) {
      try {
        await this.iterateFeed(postFeed, 'posts', options);
      } catch (err) {
        logger.errorWhen('running collector for posts with hashtag', err)
      }
    }
  } catch (err) {
    logger.errorWhen(`searching for hashtag '${hashtagString}'`, err);
    return;
  }
};

InstaCollector.prototype.startCollectingPostsWithLocation = async function (locationString, options) {
  try {
    const location = await Instagram.Location.search(this.session, locationString)
    .then(locationResults => locationResults[0]);
    const postFeed = await new Instagram.Feed.LocationMedia(this.session, location.params.id);

    while (true) {
      try {
        await this.iterateFeed(postFeed, 'posts', options);
      } catch (err) {
        logger.errorWhen('running collector for posts with location', err)
      }
    }
  } catch (err) {
    logger.errorWhen(`searching for location '${locationString}'`, err);
    return;
  }
};

module.exports = InstaCollector;

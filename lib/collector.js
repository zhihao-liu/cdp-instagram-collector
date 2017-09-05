'use strict';

const Promise = require('bluebird');
const _ = require('underscore');
const path = require('path');
const Mongo = require('mongodb').MongoClient();
const Instagram = require('instagram-private-api').V1;
const logger = require('./logger');
const utilities = require('./utilities');

class InstaCollector {
  constructor(loginInfo, config) {
    this.loginInfo = loginInfo;
    this.config = config;

    this.session = null;
    this.mongo = null;
  }

  async activate(loginInfo, config) {
    if (this.session === null) this.session = await this.createInstaSession();
    if (this.mongo === null) this.mongo = await this.connectToMongo();

    if (this.mongo.listCollections({}).toArray().length === 0) await this.initializeMongoCollections();
  };

  connectToMongo() {
    const connectionUrl = `mongodb://localhost:${this.config.mongoPortDefault}/${this.config.mongoName}`;
    return Mongo.connect(connectionUrl);
  };

  initializeMongoCollections() {
    return Promise.all([
      InstaCollector.createIndexedCollection(this.mongo, 'users'),
      InstaCollector.createIndexedCollection(this.mongo, 'posts')
    ])
  };

  createInstaSession() {
    const device = new Instagram.Device(this.loginInfo.username);
    const cookie = new Instagram.CookieMemoryStorage();
    return Instagram.Session.create(device, cookie, this.loginInfo.username, this.loginInfo.password);
  };

  static createIndexedCollection(mongo, collectionName) {
    return mongo.createCollection(collectionName)
      .then(collection => collection.ensureIndex({'info.id': 1}, {unique: true}));
  }

  async startCollectingUsers() {
    // search for influencer (e.g. Instagram Official Account)
    const influencerUsername = 'instagram';
    const influencerAccount = await Instagram.Account.searchForUser(this.session, influencerUsername);

    // create feed of users (followers of pInfluencer)
    const userFeed = await new Instagram.Feed.AccountFollowers(this.session, influencerAccount.params.id);

    // fetch data from feed of users
    while (true) {
      // try {
      await this.iterateFeed(userFeed, this.mongo.collection('users'));
      // } catch (err) {
      //   logger.errorWhen('fetching data of users', err);
      // }
    }
  };

  async startCollectingUserPosts() {
    while (true) {
      // try {
      await this.collectUserPosts();
      // } catch (err) {
      //   logger.errorWhen('fetching data of user posts', err);
      // }
    }
  }

  async startCollectingHashTaggedPosts(hashtag, limit = Infinity) {
    const postFeed = await new Instagram.Feed.TaggedMedia(this.session, hashtag);
    while (true) {
      // try {
      await this.iterateFeed(postFeed, this.mongo.collection(`posts`), limit);
      // } catch (err) {
      //   logger.errorWhen(`fetching posts with hashtag "${hashtag}"`, err);
      // }
    }
  }

  async startCollectingLocatedPosts(locationName, limit = Infinity) {
    let location;

    try {
      location = await Instagram.Location.search(this.session, locationName)
        .then(locationResults => locationResults[0]);
    } catch (err) {
      logger.errorWhen(`searching for location ${locationName}`, err);
      return;
    }

    const postFeed = await new Instagram.Feed.LocationMedia(this.session, location.params.id);

    while (true) {
      // try {
      await this.iterateFeed(postFeed, this.mongo.collection(`posts`), limit);
      // } catch (err) {
      //   logger.errorWhen(`fetching posts with location ${locationName}`, err);
      // }
    }
  };

  async collectUserPosts() {
    let pAllUsersHandled = [];
    const dateStringToday = utilities.dateStringToday();

    const cursorCollectionUsers = this.mongo.collection('users')
      .find({datesFetched: {$nin: [dateStringToday]}, 'info.isPrivate': false});

    while (await cursorCollectionUsers.hasNext()) {
      try {
        const item = await cursorCollectionUsers.next();
        const limit = (typeof item.datesFetched) === 'undefined' ? Infinity : this.config.numUserPostsPerDay;
        const postFeed = await new Instagram.Feed.UserMedia(this.session, item.info.id);

        pAllUsersHandled.push(
          this.iterateFeed(postFeed, this.mongo.collection('posts'), limit)
            .then(() => {
              let datesFetched = (typeof item.datesFetched) !== 'undefined' ? item.datesFetched : [];
              datesFetched.push(dateStringToday);
              // mark user whose posts for today have been fetched
              return this.mongo.collection('users').updateOne({'info.id': item.info.id}, {$set: {datesFetched: datesFetched}})
            })
            .catch(err => {
              const ignorableErrors = ['MongoError: connection'];
              if (!utilities.errorInList(err, ignorableErrors)) {
                logger.errorWhen(`fetching data of user "${item.info.username}"`, err);
              }
            })
        );
      }
      catch (err) {
        logger.errorWhen('retrieving user info from MongoDB', err);
      }
    }

    return Promise.all(pAllUsersHandled);
  };

  async startDownloadingPostMedia() {
    while (true) {
      // try {
      await this.downloadPostMedia();
      // } catch (err) {
      //   logger.errorWhen('downloading media of posts', err);
      // }
    }
}

  async startDownloadingProfilePictures() {
    while (true) {
      // try {
      await this.downloadProfilePictures();
      // } catch (err) {
      //   logger.errorWhen('downloading media of posts', err);
      // }
    }
  }

  static onErrorDownloading(err) {
    const ignorableErrors = [
      'Error: Unexpected HTTP status code: 404',
      'Error: Unexpected HTTP status code: 502',
      'Error: read ECONNRESET',
      'Error: connect ENOBUFS',
      'Error: connect EADDRINUSE'];
    if (!utilities.errorInList(err, ignorableErrors)) {
      logger.errorWhen('downloading content from Instagram Server', err);
    }
  }

  async downloadPostMedia() {
    const cursorCollectionPosts = this.mongo.collection('posts')
      .find({mediaSrc: {$exists: false}});

    while (await cursorCollectionPosts.hasNext()) {
      try {
        const item = await cursorCollectionPosts.next();
        let srcNames = [];
        switch (item.info.mediaType) {
          case 1: { // single image
            const srcName = `img_${item.info.id}_0.jpg`;
            const srcPath = path.join(this.config.pathPostMedia, srcName);
            await utilities.download(item.info.images[0].url, srcPath)
              .then(() => srcNames.push(srcName));
          }
            break;

          case 2: { // single video
            const srcName = `vid_${item.info.id}_0.mp4`;
            const srcPath = path.join(this.config.pathPostMedia, srcName);
            await utilities.download(item.info.videos[0].url, srcPath)
              .then(() => srcNames.push(srcName));
          }
            break;

          case 8: { // multiple images
            for (let i = 1; i < item.info.images.length; ++i) {
              const srcName = `img_${item.info.id}_${i}.jpg`;
              const srcPath = path.join(this.config.pathPostMedia, srcName);
              await utilities.download(item.info.images[i][0].url, srcPath)
                .then(() => srcNames.push(srcName));
            }
          }
            break;

          default:
            break;
        }

        await this.mongo.collection('posts').updateOne(
          {'info.id': item.info.id},
          {$set: {mediaSrc: srcNames}});
      } catch (err) {
        InstaCollector.onErrorDownloading(err);
      }
    }
  };

  async downloadProfilePictures() {
    const cursorCollectionPosts = this.mongo.collection('users')
      .find({profileSrc: {$exists: false}});

    while (await cursorCollectionPosts.hasNext()) {
      try {
        const item = await cursorCollectionPosts.next();
        const srcName = `pic_${item.info.id}.jpg`;
        const srcPath = path.join(this.config.pathProfilePictures, srcName);

        await utilities.download(item.info.picture, srcPath);
        await this.mongo.collection('users').updateOne(
          {'info.id': item.info.id},
          {$set: {profileSrc: srcName}});
      } catch (err) {
        InstaCollector.onErrorDownloading(err);
      }
    }
  }

  // iterate data of given feed and push them into MongoDB
  async iterateFeed(feed, mongoCollection, limit = Infinity) {
    let pAllPagesHandled = [];
    let countItemsFetched = 0;

    do {
      if (countItemsFetched >= limit) break;

      try {
        const nextPage = _.flatten(await feed.get());
        await InstaCollector.pushIntoMongo(nextPage, mongoCollection);
        countItemsFetched += nextPage.length
      } catch (err) {
        // The message of errorWhen to be handled as putting function to sleep:
        // "RequestError: Please wait a few minutes before you try again."
        const ignorableErrors = [
          'MongoError: E11000 duplicate key',
          'MongoError: connection',
          'PrivateUserError',
          'RequestError: Error: socket hang up',
          'RequestError: Error: read ECONNRESET',
          'RequestError: Error: connect EADDRINUSE',
          'RequestError: Error: connect ENOBUFS'];

        if (!utilities.errorInList(err, ignorableErrors)) logger.errorWhen(`iterating feed data of ${mongoCollection.s.name}`, err);

        if (utilities.errorInList(err, ['RequestError: Please wait a few minutes'])) {
          // logger.info(`Fetching feed data of ${mongoCollection.s.name} put to sleep for ${sleepDuration} minutes...`);
          await utilities.wait(this.config.sleepDuration); // put fetching function to sleep for serveral minutes if request failed
        }
      }
    } while (feed.isMoreAvailable());
  };

  static pushIntoMongo(array, mongoCollection) {
    let pAllItemsHandled = [];
    for (const item of array) {
      pAllItemsHandled.push(mongoCollection.updateOne({id: item.params.id}, {$set: {info: item.params}}, {upsert: true}));
    }

    return Promise.all(pAllItemsHandled);
  }
}

module.exports = InstaCollector;
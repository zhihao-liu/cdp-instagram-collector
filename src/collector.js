'use strict';

const Promise = require('bluebird');
const _ = require('underscore');
const fs = require('fs');
const download = require('download');
const path = require('path');
const Mongo = require('mongodb').MongoClient();
const Instagram = require('instagram-private-api').V1;
const logger = require('./logger');
const utilities = require('./utilities');

class InstaCollector {
  mongo = null;
  session = null;
  loginInfo = null;
  config = null;

  async constructor(loginInfo, config) {
    this.loginInfo = loginInfo;
    this.config = config;

    if (this.session === null) this.session = await this.createInstaSession();
    if (this.mongo === null) this.mongo = await this.connectToMongo();
    if (this.mongo.listCollections({}).toArray().length === 0) await this.initializeMongoCollections();
  };

  connectToMongo() {
    const connectionUrl = 'mongodb://localhost:27017/instagram';
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
      try {
        await InstaCollector.iterateFeed(userFeed, this.mongo.collection('users'));
      } catch (err) {
        logger.errorWhen('fetching data of users', err);
      }
    }
  };

  async startCollectingUserPosts() {
    while (true) {
      try {
        await this.collectUserPosts();
      } catch (err) {
        logger.errorWhen('fetching data of user posts', err);
      }
    }
  }

  async startCollectingHashTaggedPosts(hashtag, limit = Infinity) {
    const postFeed = Instagram.Feed.TaggedMedia(this.session, hashtag);
    while (true) {
      try {
        await InstaCollector.iterateFeed(postFeed, this.mongo.collection(`posts`), limit);
      } catch (err) {
        logger.errorWhen(`fetching posts with hashtag "${hashtag}"`, err);
      }
    }
  }

  async startCollectingLocatedPosts(locationName, limit = Infinity) {
    let location;

    try {
      location = await
          Instagram.Location.search(this.session, locationName)
              .then(locationResults => locationResults[0]);
    } catch (err) {
      logger.errorWhen(`searching for location ${locationName}`, err);
      return;
    }

    const postFeed = new Instagram.Feed.LocationMedia(this.session, location.params.id);

    while (true) {
      try {
        await InstaCollector.iterateFeed(postFeed, this.mongo.collection(`posts`), limit);
      } catch (err) {
        logger.errorWhen(`fetching posts with location ${locationName}`, err);
      }
    }
  };

  async collectUserPosts() {
    let pAllUsersHandled = [];
    const dateString = utilities.dateString(new Date());

    const cursorCollectionUsers = this.mongo.collection('users')
        .find({datesFetched: {$nin: [dateString]}, 'info.isPrivate': false});

    while (await cursorCollectionUsers.hasNext()) {
      try {
        const item = await cursorCollectionUsers.next();
        const limit = (typeof item.datesFetched) === 'undefined' ? Infinity : this.config.numUserPostsPerDay;
        const postFeed = new Instagram.Feed.UserMedia(this.session, item.info.id);

        pAllUsersHandled.push(
            InstaCollector.iterateFeed(postFeed, this.mongo.collection('posts'), limit)
                .then(() => {
                  let datesFetched = (typeof item.datesFetched) !== 'undefined' ? item.datesFetched : [];
                  datesFetched.push(dateString);
                  // mark user whose posts for today have been fetched
                  return this.mongo.collection('users').updateOne({'info.id': item.info.id}, {$set: {datesFetched: datesFetched}})
                })
        );
      }
      catch (err) {
        logger.errorWhen('retrieving user info from MongoDB', err);
      }
    }

    return Promise.all(pAllUsersHandled);
  };

  async startDownloadingMedia() {
    while (true) {
      try {
        await this.downloadMedia();
      } catch (err) {
        logger.errorWhen('downloading media of posts', err);
      }
    }
  }

  async downloadMedia() {
    const cursorCollectionPosts = this.mongo.collection('posts')
        .find({mediaSrc: {$exists: false}});

    while (await cursorCollectionPosts.hasNext()) {
      try {
        const item = await cursorCollectionPosts.next();
        let srcPaths = [];
        let pAllMediaDownloaded = [];
        switch (item.info.mediaType) {
          case 1: { // single image
            const pMediaDownloaded = download(item.info.images[0].url).then(data => {
              const srcPath = path.join(this.config.downloadPath, `img_${item.info.id}_0.jpg`);
              srcPaths.push(srcPath);
              return fs.writeFileSync(srcPath, data);
            });
            pMediaDownloaded.catch(err => {
              throw err;
            });
            pAllMediaDownloaded.push(pMediaDownloaded);
          }
            break;

          case 2: { // single video
            const pMediaDownloaded = download(item.info.videos[0].url).then(async data => {
              const srcPath = path.join(this.config.downloadPath, `vid_${item.info.id}_0.mp4`);
              srcPaths.push(srcPath);
              return fs.writeFileSync(srcPath, data);
            });
            pMediaDownloaded.catch(err => {
              throw err;
            });
            pAllMediaDownloaded.push(pMediaDownloaded);
          }
            break;

          case 8: { // multiple images
            for (let i = 1; i < item.info.images.length; ++i) {
              const pMediaDownloaded = download(item.info.images[i][0].url).then(data => {
                const srcPath = path.join(this.config.downloadPath, `img_${item.info.id}_${i}.jpg`);
                srcPaths.push(srcPath);
                return fs.writeFileSync(srcPath, data);
              });
              pMediaDownloaded.catch(err => {
                throw err;
              });
              pAllMediaDownloaded.push(pMediaDownloaded);
            }
          }
            break;

          default:
            break;
        }
        Promise.all(pAllMediaDownloaded).then(() => {
          return this.mongo.collection('posts').updateOne({'info.id': item.info.id},
              {$set: {mediaSrc: srcPaths}});
        });
      }
      catch (err) {
        logger.errorWhen('downloading post media from Instagram Server', err);
      }
    }
  };

  // iterate data of given feed and push them into MongoDB
  static async iterateFeed(feed, mongoCollection, limit = Infinity) {
    let pAllPagesHandled = [];
    let countItemsFetched = 0;
    const sleepDuration = 5; // put fetching function to sleep for serveral minutes if request failed

    do {
      if (countItemsFetched >= limit) break;

      try {
        const nextPage = _.flatten(await
                feed.get()
            )
        ;
        pAllPagesHandled.push(
            InstaCollector.pushIntoMongo(nextPage, mongoCollection)
                .then(() => countItemsFetched += nextPage.length)
                .catch(err => {
                  // docs with duplicate key cannot be successfully inserted
                  // thus repeatitions will be ignored
                  const ignorableErrors = ['MongoError: E11000 duplicate key', 'MongoError: connection'];
                  if (!utilities.errorInList(err, ignorableErrors)) logger.errorWhen('inserting docs into MongoDB', err);
                })
        );
      } catch (err) {
        // The message of errorWhen to be handled as putting function to sleep:
        // "RequestError: Please wait a few minutes before you try again."
        const ignorableErrors = ['PrivateUserError'];

        if (utilities.errorInList(err, ignorableErrors)) logger.errorWhen(`iterating feed data of ${mongoCollection.s.name}`, err);

        if (utilities.errorInList(err, ['RequestError: Please wait a few minutes'])) {
          // logger.info(`Fetching feed data of ${mongoCollection.s.name} put to sleep for ${sleepDuration} minutes...`);
          await
              utilities.wait(sleepDuration);
        }
      }
    } while (feed.isMoreAvailable());

    return Promise.all(pAllPagesHandled);
  };

  static pushIntoMongo(array, mongoCollection) {
    let pAllItemsHandled = [];
    for (const item of array) {
      pAllItemsHandled.push(mongoCollection.update({id: item.params.id}, {$set: {info: item.params}}, {upsert: true}));
    }

    return Promise.all(pAllItemsHandled);
  }
}

module.exports = InstaCollector;
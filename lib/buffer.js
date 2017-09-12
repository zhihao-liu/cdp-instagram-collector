'use strict';

const path = require('path');
const logger = require('./logger');
const utilities = require('./utilities');

const Buffer = function (mongoCollection, savePath, size) {
  this.mongoCollection = mongoCollection;
  this.savePath = savePath;
  this.size = size;

  this.bulk = this.mongoCollection.initializeUnorderedBulkOp();
};

Buffer.prototype.push = async function (itemInfo, options) {
  options = typeof options !== 'undefined' ? options : {};
  options.saveFiles = typeof options.saveFiles !== 'undefined' ? options.saveFiles : true;

  const src = options.saveFiles ? await this.saveFiles(itemInfo) : null;

  this.bulk
    .find({'info.id': itemInfo.id})
    .upsert()
    .updateOne({info: itemInfo, src: src});

  if (this.bulk.s.currentIndex >= this.size) this.flush();
};

Buffer.prototype.flush = function () {
  this.bulk.execute().catch(err => logger.errorWhen('executing bulk operations', err));

  this.bulkCount = 0;
  this.bulk = this.mongoCollection.initializeUnorderedBulkOp();
};

Buffer.prototype.saveFiles = async function (itemInfo) {
  try {
    if (typeof itemInfo.mediaType !== 'undefined') {
      let srcNames = [];

      switch (itemInfo.mediaType) {
        case 1: {  // single image
          const srcName = `img_${itemInfo.id}_0.jpg`;
          const srcPath = path.join(this.savePath, srcName);
          await utilities.download(itemInfo.images[0].url, srcPath)
            .then(() => srcNames.push(srcName));

          break;
        }

        case 2: { // single video
          const srcName = `vid_${itemInfo.id}_0.mp4`;
          const srcPath = path.join(this.savePath, srcName);
          await utilities.download(itemInfo.videos[0].url, srcPath)
            .then(() => srcNames.push(srcName));

          break;
        }

        case 8: { // multiple images
          for (let i = 1; i < itemInfo.images.length; ++i) {
            const srcName = `img_${itemInfo.id}_${i}.jpg`;
            const srcPath = path.join(this.savePath, srcName);
            await utilities.download(itemInfo.images[i][0].url, srcPath)
              .then(() => srcNames.push(srcName));
          }

          break;
        }

        default:
          break;
      }

      return srcNames;
    }

    if (typeof itemInfo.picture !== 'undefined') {
      const srcName = `pic_${itemInfo.id}.jpg`;
      const srcPath = path.join(this.savePath, srcName);

      await utilities.download(itemInfo.picture, srcPath);

      return srcName;
    }
  } catch (err) {
    Buffer.onErrorDownloading(err);
  }
};

Buffer.onErrorDownloading = function (err) {
  const ignorableErrors = [
    'Error: Unexpected HTTP status code: 302',
    'Error: Unexpected HTTP status code: 404',
    'Error: Unexpected HTTP status code: 502',
    'Error: read ECONNRESET',
    'Error: connect ENOBUFS',
    'Error: connect EADDRINUSE',
    'Error: connect ETIMEDOUT'
  ];
  if (!utilities.errorInList(err, ignorableErrors))
    logger.errorWhen('downloading content from Instagram Server', err);
};

module.exports = Buffer;
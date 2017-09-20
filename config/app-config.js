'use strict';

const path = require('path');

module.exports = {
  serverPortDefault: 3000,
  mongoPortDefault: 27017,
  mongoConnectionUrl: 'mongodb://localhost:27017/cdpInsta',
  saveMediaToLocal: true,
  mediaStoragePath: 'E:/instagram_media',
  numUserPostsPerDay: 20,
  numTaggedPostsPerHour: 100,
  numUsersInProgress: 20,
  sleepDuration: 5,

  get bufferSize() {
    return this.saveMediaToLocal ? {users: 200, posts: 200} : {users: 4000, posts: 1000};
  },

  get srcDir() {
    return {
      users: path.join(this.mediaStoragePath, 'profile-pictures'),
      posts: path.join(this.mediaStoragePath, 'post-media')
    };
  }
};
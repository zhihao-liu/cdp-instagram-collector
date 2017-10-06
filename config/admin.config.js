'use strict';

const path = require('path');
const userConfig = require('./user.config.js');

const adminConfig = {
  loginInfo: {
    username: 'mcrlab',
    password: 'uottawa-mcrlab'
  },

  mongoConnectionUrl: 'mongodb://localhost:27017/instagram',

  saveMediaToLocal: true,
  mediaStoragePath: path.resolve(__dirname, '../data'),
  
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

module.exports = Object.assign(adminConfig, userConfig);
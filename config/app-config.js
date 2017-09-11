'use strict';

const path = require('path');

const storagePath = path.join(__dirname, '../../data');

module.exports = {
  serverPortDefault: 3000,
  mongoPortDefault: 27017,
  mongoName: 'cdpInsta',
  numUserPostsPerDay: 20,
  numTaggedPostsPerHour: 100,
  numUsersInProgress: 20,
  sleepDuration: 5,
  bufferSize: {
    users: 100,
    posts: 100
  },
  srcPath: {
    users: path.join(storagePath, 'profile-pictures'),
    posts: path.join(storagePath, 'post-media')
  }
};
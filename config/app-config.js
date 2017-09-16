'use strict';

const path = require('path');

module.exports = {
  serverPortDefault: 3000,
  mongoPortDefault: 27017,
  mongoName: 'cdpInsta',
  mediaStoragePath: path.join(__dirname, '../../data'),
  numUserPostsPerDay: 20,
  numTaggedPostsPerHour: 100,
  numUsersInProgress: 20,
  sleepDuration: 5,
  bufferSize: {
    users: 200,
    posts: 200
  },
  srcDir: {
    users: 'profile-pictures',
    posts: 'post-media'
  }
};

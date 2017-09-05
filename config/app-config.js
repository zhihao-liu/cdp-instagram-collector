'use strict';

const path = require('path');

module.exports = {
  serverPortDefault: 3000,
  mongoPortDefault: 27017,
  mongoName: 'instagram',
  pathPostMedia: path.join(__dirname, '../../data/post-media'),
  pathProfilePictures: path.join(__dirname, '../../data/profile-pictures'),
  numUserPostsPerDay: 20,
  numTaggedPostsPerHour: 100,
  sleepDuration: 5
};
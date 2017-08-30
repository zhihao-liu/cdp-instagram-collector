'use strict';

const path = require('path');

module.exports = {
  serverPortDefault: 3000,
  mongoPortDefault: 27017,
  mongoName: 'instagram',
  pathPostMedia: path.join(__dirname, '../../data-collection/media-insta'),
  pathProfilePictures: path.join(__dirname, '../../data-collection/profile-insta'),
  numUserPostsPerDay: 20,
  numTaggedPostsPerHour: 100,
  sleepDuration: 5
};
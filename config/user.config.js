'use strict';

const userConfig ={
  mongoConnectionUrl: 'mongodb://localhost:27017/cdpInsta',

  saveMediaToLocal: true,
  // mediaStoragePath: 'e:/instagram_media',

  tasks: {
    fetchUsers: {
      on: true
    },

    fetchPosts: {
      on: true,
      historicalOnly: true
    },

    fetchHashtagPosts: {
      on: true,
      hashtags: [ 'canada', 'ottawa' ]
    },

    fetchLocationPosts: {
      on: true,
      locations: [ 'chicago', 'philadelphia' ]
    }
  }
};

module.exports = userConfig;
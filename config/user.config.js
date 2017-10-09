'use strict';

const userConfig ={
  mongoConnectionUrl: 'mongodb://localhost:27017/cdpInsta',

  saveMediaToLocal: false,
  mediaStoragePath: 'e:/instagram_media',

  /*
  // by default the collector uses the instagram account 'mcrlab'
  // if it gets blocked after several months due to heavy requests
  // you can sign up a new one and put it here
  loginInfo = {
    username: 'PUT THE USERNAME HERE',
    password: 'PUT THE PASSWORD HERE'
  }
  */

  tasks: {
    fetchUsers: {
      on: true
    },

    fetchPosts: {
      on: true,
      historicalOnly: true
    },

    fetchHashtagPosts: {
      on: false,
      hashtags: [ 'ottawa', 'toronto' ]
    },

    fetchLocationPosts: {
      on: false,
      locations: [ 'chicago', 'philadelphia' ]
    }
  }
};

module.exports = userConfig;
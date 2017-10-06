'use strict';

const path = require('path');
const logger = require('./modules/logger');
const InstaCollector = require('./modules/collector');
const config = require('./config/admin.config.js');

async function main() {
  const collector = new InstaCollector(config.loginInfo, config);
  await collector.activate();

  const tasks = config.tasks;

  if (tasks.fetchUsers.on) {
    collector.startCollectingUsers()
      .catch(err => logger.errorWhen('starting collector for users', err));

    logger.info('Collecting users started.');
  };

  if (tasks.fetchPosts.on) {
    const option = {historicalOnly: tasks.fetchPosts.historicalOnly};

    collector.startCollectingPosts(option)
      .catch(err => logger.errorWhen('starting collector for new posts from users', err));

    logger.info('Collecting posts started.');
  }

  TASK_HASHTAG: {
    if (tasks.fetchHashtagPosts.on) {
      const hashtags = tasks.fetchHashtagPosts.hashtags;
      if (!hashtags || !Array.isArray(hashtags)) break TASK_HASHTAG;

      for (let hashtag of hashtags) {
        hashtag = hashtag.trim();

        collector.startCollectingPostsWithHashtag(hashtag)
          .catch(err => logger.errorWhen(`starting collector for posts with hashtag "${hashtag}"`, err));

        logger.info(`Collecting posts with hashtag "${hashtag}" started.`);
      }
    }
  }

  TASK_LOCATION: {
    if (tasks.fetchLocationPosts.on) {
      const locations = tasks.fetchLocationPosts.locations
      if (!locations || !Array.isArray(locations)) break TASK_LOCATION;

      for (let location of locations) {
        location = location.trim();

        collector.startCollectingPostsWithHashtag(location)
          .catch(err => logger.errorWhen(`starting collector for posts with location "${location}"`, err));

        logger.info(`Collecting posts with location "${location}" started.`);
      }
    }
  }
}

main().catch(err => logger.errorWhen('running main application', err));
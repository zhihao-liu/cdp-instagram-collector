'use strict';

const Promise = require('bluebird');
const utilities = require('./lib/utilities');
const logger = require('./lib/logger');
const Mongo = require('mongodb').MongoClient();
const config = require('./config/app-config');
const path = require('path');

utilities.download('https://scontent-yyz1-1.cdninstagram.com/t51.2885-15/e35/21107228_1458859437541348_212282503816282112_n.jpg?ig_cache_key=MTU4ODY4NzU2NTc1Njc0NTEzNw%3D%3D.2&se=8',
  config.pathPostMedia + '/../x.jpg');
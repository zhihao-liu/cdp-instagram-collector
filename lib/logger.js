'use strict';

const log4js = require('log4js');
const path = require('path');
const utilities = require('./utilities');


log4js.configure({
  appenders: {
    console: {type: 'console'},
    file: {type: 'file', filename: path.join(__dirname, `../logs/${utilities.dateStringToday()}.log`)}
  },
  categories: {
    default: {appenders: ['console', 'file'], level: 'info'}
  }
});


const logger = log4js.getLogger();

// show message of error and where it happens
logger.errorWhen = function (occasion, err) {
  this.error(`Error when ${occasion}: ${err}`);
};


// log message and send it as response
logger.infoWithResponse = function (message, res) {
  this.info(message);
  res.status(200);
  res.send(message);
};

module.exports = logger;
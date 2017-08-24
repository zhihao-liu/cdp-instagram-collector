'use strict';

const log4js = require('log4js');
const path = require('path');


log4js.configure({
  appenders: {
    console: {type: 'console'},
    file: {type: 'file', filename: path.join(__dirname, `../logs/mcrlab.log`)}
  },
  categories: {
    default: {appenders: ['console', 'file'], level: 'info'}
  }
});


const logger = log4js.getLogger();

// show status code and message of errorWhen and where it happens
logger.errorWhen = function (occasion, err) {
  this.errorWhen(`Error when ${occasion}: ${err}`);
}


// log message and send it as response
logger.infoWithResponse = function (message, res) {
  this.info(message);
  res.status(200);
  res.send(message);
}

module.exports = logger;
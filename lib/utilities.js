'use strict';

const Promise = require('bluebird');
const downloadToFile = require('download-to-file');

// put asynchronous function to sleep
module.exports.wait = function (minutes) {
  return new Promise(resolve => setTimeout(resolve, minutes * 60 * 1000));
};

// ignore some known errors in console log
module.exports.errorInList = function (err, knownErrors) {
  for (const item of knownErrors) {
    if (err.toString().substr(0, item.length).toLowerCase() === item.toLowerCase()) return true;
  }

  return false;
};

module.exports.dateString = function (date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

module.exports.dateStringToday = function () {
  return module.exports.dateString(new Date());
};

module.exports.download = function (url, path) {
  return new Promise((resolve, reject) => {
    downloadToFile(url, path, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    })
  });
};
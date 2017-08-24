'use strict';

const Promise = require('bluebird');

// put asynchronous function to sleep
module.exports.wait = function (minutes) {
    return new Promise((resolve) => setTimeout(resolve, minutes * 60 * 1000));
}

// ignore some known errors in console log
module.exports.errorInList = function(err, knownErrors) {
    for (const item of knownErrors) {
        if (err.toString().substr(0, item.length) === item) return true;
    }

    return false;
}

module.exports.dateString = function(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
'use strict'
//
// const Instagram = require('instagram-private-api').V1;
// const login = require('./config/login');
// const _ = require('underscore');
// const Mongo = require('mongodb').MongoClient();
//
// async function main() {
//   const connectionUrl = 'mongodb://localhost:27017/test';
//   const mongo = await Mongo.connect(connectionUrl);
//
//   const cursor = mongo.collection('col').find();
//
//   for (let i = 0; i < 5; ++i) {
//     cursor.next().then((item) => {console.log(item)});
//     // const item = await cursor.next();
//     // console.log(item);
//   }
// }
//
// const pm = main();

const res = 3 in [1, 2];
console.log(res);
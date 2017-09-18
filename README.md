'use strict';

const Mongo = require('mongodb').MongoClient();

async function main() {
  const mongoTo = await Mongo.connect('mongodb://localhost:27017/cdpInsta');
  const mongoFrom = await Mongo.connect('mongodb://localhost:27017/cdpInsta1');

  for (const col of ['users', 'posts']) {
    mongoFrom.collection(col).find().forEach(async item => {
      try {
        await mongoTo.collection(col).insertOne(item);
      }
      catch (err) {}
      finally {
        await mongoFrom.collection(col).deleteOne({_id: item._id});
      }
    }, err => {
      if (err) {
        console.log('ERROR: ' + err);
      } else {
        console.log('DONE');
      }
    });
  }
}

main();

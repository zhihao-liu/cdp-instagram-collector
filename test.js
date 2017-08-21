'use strict'

const Instagram = require('instagram-private-api').V1;
const login = require('./config/login');
const _ = require('underscore');
const Mongo = require('mongodb').MongoClient();

async function main() {
  const device = new Instagram.Device(login.username);
  const cookie = new Instagram.CookieMemoryStorage();
  const session = await Instagram.Session.create(device, cookie, login.username, login.password)

  const location = await Instagram.Location.search(session);

  console.log(location);
}

const pm = main();
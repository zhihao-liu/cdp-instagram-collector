# CDP Instagram Collector  
A module of City Digital Pulse (University of Ottawa - MCRLab) for collecting data of public content on Instagram.  

## Run Application  
#### Quick Start  
1. Install Node:  
`$ brew install node`  
2. Install MongoDB:  
`$ brew install mongodb`  
3. Install Yarn:  
`$ npm install yarn`  
4. Open terminal in the project folder.  
5. Install all node dependencies:  
`$ yarn install`
> **Note**: You must use Yarn for this step to ensure all the dependencies are installed with the proper version. For the following steps you can use npm instead.
6. Start the application:  
`$ yarn run start`  

#### For Deployment  
The application can be deployed in the background and the process will be managed by PM2.    
`$ yarn run deploy`  
You can use npm scripts as shortcuts to manage PM2 process.  
  1. `$ yarn run deploy-start`  
  2. `$ yarn run deploy-stop`  
  3. `$ yarn run deploy-restart`  
  4. `$ yarn run deploy-delete`  

## Customized Configuration `/config/user.config.js`  
1. mongoConnectionUrl: The connection URL of the database where the collected data will be stored.  
2. saveMediaLocal: Set to true if you want to save images/videos of posts and profile pictures of users as local files.  
3. mediaStoragePath: The path of the folder where the media files will be saved.  
4. loginInfo: The username and password of the account used to collect data. If you would like to use an account different from the default one you can set it here.  
5. tasks: The collecting tasks to be triggered when the application starts.  

## Module API  
#### Collector Module `/modules/collector.js`  
- **InstaCollector(loginInfo, config)**: Create a new instance of the *InstaCollector* class with account login info and specified configuration.  
- **InstaCollector.prototype.activate()**: Asynchronously activate the collector, including initializing an Instagram session, connecting to MongoDB, initializing MongoDB collections and indices, initializing buffers, etc.  
- **InstaCollector.prototype.iterateFeed(feed, collectionName, options)**: Iterating the [Feed](https://www.npmjs.com/package/instagram-private-api) object (which is an infinite list of records) and save the records to the specified collection serially.  
- **InstaCollector.prototype.startCollectingUsers()**: Start a task of collecting data of user information infinitely.  
*InstaCollector.prototype.startCollectingPosts()*: Start a task of collecting data of post information infinitely.  
- **InstaCollector.prototype.startCollectingPostsWithHashtag(hashtagString, options)**: Start a task of collecting data of posts with a specified hashtag infinitely. The *hashtagString* parameter is a string that contains no spaces.  
- **InstaCollector.prototype.startCollectingPostsWithLocation(locationString, options)**: Start a task of collecting data of posts with a specified location infinitely. The *locationString* parameter is a string of the name of a location. The function will search for locations using the string and pick the most matched result.  

#### Buffer Module `/modules/buffer.js`  
- **Buffer(mongoCollection, savePath, size)**: Create an instance of the *Buffer* class with the MongoDB collection where records are pushed to, the path of the folder where media files are saved and the size of the buffer. The records will be stored in the buffer and be pushed into the database collection everytime the number of records in the buffer reaches the size.  
- **Buffer.prototype.flush()**: Push all the records in the buffer into the database and reset the buffer.  
- **Buffer.prototype.saveFiles(itemInfo)**: Download the media with the URLs in the *infoItem* object and save them locally.  

#### Logger Module `/modules/logger.js`  
A simple decoration of the npm *log4js* module.  

#### Utilities Module `/modules/utilities.js`  
Several useful functions.  

- **wait(minutes)**: A wrapper of *setTimeout*. Return a *Promise* that will be resolved after several minutes.  
- **errorInList(err, knownErrors)**: Test whether an error message is in a list of known error messages.  
- **dateStringToday()**: Create a date string represents today.  
- **download(url, path)**: A wrapper of the npm *downloadToFile* module. Download the file from a specified URL to the specified path.  

> **Zhihao Liu**  
> E-mail: [c.liu.zh@gmail.com](c.liu.zh@gmail.com)  
> Github: [github.com/cliuzh](github.com/cliuzh)   
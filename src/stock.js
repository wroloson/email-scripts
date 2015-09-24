#!/usr/bin/env node

var _ = require('underscore');
var async = require('async');
var http = require('http');
var Twitter = require('twitter');
var nodemailer = require("nodemailer");
var moment = require("moment");
var schedule = require('node-schedule');
var bunyan = require('bunyan');
var bunyanDebugStream = require('bunyan-debug-stream');
var log = bunyan.createLogger({
	name: 'stock - '+__filename+' ',
	streams: [{
		level: 'trace',
		type: 'raw',
		stream: bunyanDebugStream({
			basepath: __dirname
		})
	}],
	serializers: bunyanDebugStream.serializers
});

if (process.env.TICKERS == null) {
   log.error("ERROR: no tickers specified in environment variable TICKERS - Exiting...");
   process.exit(1);
}

if (process.env.CRON_EXPRESSION == null) {
   log.error("ERROR: no cron expression specified in environment variable CRON_EXPRESSION - Exiting...");
   process.exit(1);
}

if (process.env.MAIL_PROVIDER == null) {
   log.error("ERROR: no mail provider specified in environment variable MAIL_PROVIDER - Exiting...");
   process.exit(1);
}

if (process.env.MAIL_USER == null) {
   log.error("ERROR: no mail user specified in environment variable MAIL_USER - Exiting...");
   process.exit(1);
}

if (process.env.MAIL_PASSWORD == null) {
   log.error("ERROR: no mail password specified in environment variable MAIL_PASSWORD - Exiting...");
   process.exit(1);
}

if (process.env.MAIL_RECIPIENTS == null) {
   log.error("ERROR: no mail recipients specified in environment variable MAIL_RECIPIENTS - Exiting...");
   process.exit(1);
}

if (process.env.TWITTER_CONSUMER_KEY == null) {
   log.error("ERROR: no mail recipients specified in environment variable TWITTER_CONSUMER_KEY - Exiting...");
   process.exit(1);
}

if (process.env.TWITTER_CONSUMER_SECRET == null) {
   log.error("ERROR: no mail recipients specified in environment variable TWITTER_CONSUMER_SECRET - Exiting...");
   process.exit(1);
}

if (process.env.TWITTER_ACCESS_TOKEN_KEY == null) {
   log.error("ERROR: no mail recipients specified in environment variable TWITTER_ACCESS_TOKEN_KEY - Exiting...");
   process.exit(1);
}

if (process.env.TWITTER_ACCESS_TOKEN_SECRET == null) {
   log.error("ERROR: no mail recipients specified in environment variable TWITTER_ACCESS_TOKEN_SECRET - Exiting...");
   process.exit(1);
}

//if (process.env.TWITTER_ACCOUNTS == null) {
//   log.error("ERROR: no tickers specified in environment variable TWITTER_ACCOUNTS - Exiting...");
//   process.exit(1);
//}

var tickers = process.env.TICKERS.split(',');
var cronExpression = process.env.CRON_EXPRESSION;
var mailProvider = process.env.MAIL_PROVIDER;
var mailUser = process.env.MAIL_USER;
var mailPassword = process.env.MAIL_PASSWORD;
var mailRecipients = process.env.MAIL_RECIPIENTS;
var twitterConsumerKey = process.env.TWITTER_CONSUMER_KEY;
var twitterConsumerSecret = process.env.TWITTER_CONSUMER_SECRET;
var twitterAccessTokenKey = process.env.TWITTER_ACCESS_TOKEN_KEY;
var twitterAccessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
var twitterAccounts = process.env.TWITTER_ACCOUNTS.split(',');


//var me = schedule.scheduleJob(cronExpression, function(){
  log.info("Executing stock script");
  log.info("Tickers = "+tickers);
  log.info("Twitter Accounts = "+twitterAccounts);
  var resultMail = "";
  async.parallel({
    tickers: function (callback) {
      var tickersJson = {};
      async.each(tickers, function(ticker, callback) {
        getTickerPrice(ticker, function(err, currentPrice) {
          log.trace("Got price for company "+currentPrice.company+" equal to "+currentPrice.price);
          // TODO: save data in mongo
        
          // Company price
          tickersJson[currentPrice.ticker.replace(/"/g, '')] = currentPrice;
          //tickersJson[currentPrice.ticker.replace(/"/g, '')].price = currentPrice.price;
          //tickersJson[currentPrice.ticker.replace(/"/g, '')].name = currentPrice.price;
          callback(null);
        });
      }, function(err) {
        if (err) {
          log.error(err);
          return;    
        }
        log.trace("Finished processing tickers. tickersJson = "+JSON.stringify(tickersJson));
        callback(null, tickersJson);
      });
    },
    
    twitterAccounts: function(callback) {
      async.waterfall([
        function(callback) {
          var twitterAccountsJson = {};
          async.each(twitterAccounts, function(account, callback) {
            // Get total followers
            getTwitterAccountFollowersCount(account, function (err, totalFollowers) {
              twitterAccountsJson[account] = {};
              if (err) {
                log.error("Error getting followers count for account "+account+" giving it up...: ");
                log.error(err);
                twitterAccountsJson[account].totalFollowers = "Could not retreive data";
                return callback(null);
              }
              log.trace("Twitter account "+account+" has a total of "+totalFollowers+" followers");
              twitterAccountsJson[account].totalFollowers = totalFollowers;
              callback(null);
            });
          }, function(err) {
            if (err) {
              log.error(err);
              return;    
            }
            log.trace("Finished processing total followers count. twitterAccountsJson = "+JSON.stringify(twitterAccountsJson));
            callback(null, twitterAccountsJson);
          });
        },
      
        function(twitterAccountsJson, callback) {
          async.each(twitterAccounts, function(account, callback) {
            // Get new followers
            twitterAccountsJson[account].newFollowers = [];
            getTwitterAccountNewFollowers(account, function (err, currentFollowers) {
              if (err) {
                log.error("Error getting new followers for account "+account+" giving it up...: ");
                log.error(err);
                twitterAccountsJson[account].newFollowers = ["Could not retreive data"];
                return callback(null);
              }
              log.trace("Got these twitter accounts for user "+account+": "+currentFollowers);
              for (var i = 0, len = currentFollowers.length; i < len; i++) {
                for (var j = 0, len2 = currentFollowers[i].users.length; j < len2; j++) {
                  twitterAccountsJson[account].newFollowers.push(resultMail+currentFollowers[i].users[j].name+" (@"+currentFollowers[i].users[j].screen_name+")");
                }
              }
              callback(null);
            });
          },  function(err) {
            if (err) {
              log.error(err);
              return;    
            }
            log.trace("Finished processing new twitter accounts. twitterAccountsJson = "+JSON.stringify(twitterAccountsJson));
            callback(null, twitterAccountsJson);
          });
        }],
        
        function (err, twitterAccountsJson) {
          log.trace("Finishing processing all twitter accounts (total & new followers). twitterAccountsJson = "+JSON.stringify(twitterAccountsJson));
          callback(null, twitterAccountsJson);
        });
    }
  },
  
  function (err, resultJson) {
    log.debug("Finished processing tickers and twitter accounts, sending this json via email: "+JSON.stringify(resultJson));
    sendMail(resultJson, function(err) {
      callback(null);
    });
  });
//}); 

function getTickerPrice(ticker,callback) {
  return http.get({
    host: 'download.finance.yahoo.com',
    path: '/d/quotes.csv?f=nsl1&s='+ticker
  }, function(response) {
    var body = '';
    response.on('data', function(d) {
      body += d;
    });
    response.on('end', function() {
      var parsed = body.split('",');
      callback(null,{
        company: parsed[0].replace(/"/g, ''),
        ticker: parsed[1].replace(/"/g, ''),
        price: parsed[2].replace(/\n/g, '')
      });
    });
  }); 
}

function getTickerTweets(ticker, callback) {
  var client = new Twitter({
    consumer_key: twitterConsumerKey,
    consumer_secret: twitterConsumerSecret,
    access_token_key: twitterAccessTokenKey,
    access_token_secret: twitterAccessTokenSecret
  });
  return client.get('/search/tweets', {q: ticker}, function (err, tweets, response) {
    callback(err, tweets);
  }); 
}

function getTwitterAccountFollowersCount(account, callback) {
  var client = new Twitter({
    consumer_key: twitterConsumerKey,
    consumer_secret: twitterConsumerSecret,
    access_token_key: twitterAccessTokenKey,
    access_token_secret: twitterAccessTokenSecret
  });
  client.get('/users/show', {screen_name: account}, function (err, data, response) {
    callback(err, data.followers_count);
  }); 
}

function getTwitterAccountNewFollowers(account, callback) {
  var client = new Twitter({
    consumer_key: twitterConsumerKey,
    consumer_secret: twitterConsumerSecret,
    access_token_key: twitterAccessTokenKey,
    access_token_secret: twitterAccessTokenSecret
  });
  var totalFollowers = [];
  client.get('/followers/list', {screen_name: account, count: '200'}, function getData(err, followers, response) {
    //console.log(followers);
    totalFollowers = totalFollowers.concat(followers);
    log.trace("Cursor = "+followers.next_cursor);
    if(followers.next_cursor > 0) {
      client.get('/followers/list', {screen_name: account, cursor: followers.next_cursor, count: '200'}, getData);
    } else {
      callback(err, totalFollowers);
    }
  }); 
}

function sendMail(resultJson, callback) {
  var resultMail = "";
  resultMail = resultMail+"<h2>Tickers information:</h2>";
  log.trace("Iterating over tickersJson. Size = "+_.size(resultJson.tickers));
  for (ticker in resultJson.tickers) {
    // Company Price HTML
    resultMail = resultMail+"<p>";
      resultMail = resultMail+"<h3>"+ticker+" - "+resultJson.tickers[ticker].company+"</h3>";
      resultMail = resultMail+"<ul>";
        resultMail = resultMail+"<li><strong>Price: "+resultJson.tickers[ticker].price+ "</strong></li>";
      resultMail = resultMail+"</ul>";
    resultMail = resultMail+"</p>";
  }
  log.trace("resultMail = "+resultMail);
  
  resultMail = resultMail+"<h2>Twitter accounts information:</h2>";
  log.trace("Iterating over twitterAccountsJson. Size = "+_.size(resultJson.twitterAccounts));
  for (account in resultJson.twitterAccounts) {
    // Account Total followers HTML
    resultMail = resultMail+"<p>";
      resultMail = resultMail+"<h3>@"+account+"</h3>";
      resultMail = resultMail+"<ul>";
        resultMail = resultMail+"<li><strong>Total Followers: "+resultJson.twitterAccounts[account].totalFollowers+"</strong></li>";
        resultMail = resultMail+"<li><strong>New Followers: "+resultJson.twitterAccounts[account].newFollowers.length+"</strong></li><p>";
        for (follower in resultJson.twitterAccounts[account].newFollowers) {
          resultMail = resultMail+resultJson.twitterAccounts[account].newFollowers[follower]+"<br>";
        }
      resultMail = resultMail+"</p></ul>";
    resultMail = resultMail+"</p>";
  }
  log.trace("resultMail = "+resultMail);

  
  log.debug("Sending mail with this HTML body: "+resultMail);
//  var smtpTransport = new nodemailer.createTransport({
    //service: mailProvider,
//    
//    auth: {
//      user: mailUser,
//      pass: mailPassword 
//    }
//  });
var smtpTransport = new nodemailer.createTransport();

  smtpTransport.sendMail({
    from: "Stock Mail <" + mailUser + ">",
    to: mailRecipients,
    subject: "Stock Mail - " + moment(new Date()).format('YYYY-MM-DD'),
    html: resultMail,
    generateTextFromHTML: true
  }, function(err, response) {
    if(err) {
      log.error(err);
      return;
    }
    log.info("Mail sent: " + response.message);
  });
}

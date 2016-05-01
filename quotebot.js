  var Botkit = require('botkit');
  var redis = require('botkit/lib/storage/redis_storage');
  var unirest = require('unirest');
  var config = require('./config');
  var url = require('url');
  var express = require('express');
  var port = process.env.PORT || 3002;
  var App = require("app.json")


  var app = App.new(__dirname + "/app.json");
  var redisURL = url.parse(process.env.REDISCLOUD_URL);
  var redisStorage = redis({
      namespace: 'slack-quotebot',
      host: redisURL.hostname,
      port: redisURL.port,
      auth_pass: redisURL.auth.split(":")[1]
  });

  var controller = Botkit.slackbot({
      storage: redisStorage
  }).configureSlackApp({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    //change to your own redirectUri
    redirectUri: 'https://slack-quoty.herokuapp.com/oauth',
    scopes: ['bot', 'incoming-webhook', 'channels:read','commands']
  });

  // Not needed for now
  //controller.on('direct_mention,ambient', function(bot, message) {
  //    console.log(message);
  //});

  controller.setupWebserver(port,function(err,webserver) {
    webserver.use(express.static(__dirname + '/public'));
    controller.createWebhookEndpoints(controller.webserver);
    controller.createOauthEndpoints(controller.webserver,function(err,req,res) {
      if (err) {
        res.status(500).send('ERROR: ' + err);
      } else {
        res.send('Quoty has been successfully installed!');
      }
    });
  });


  var _bots = {};
  function trackBot(bot) {
    _bots[bot.config.token] = bot;
  }

  controller.on('create_bot',function(bot,config) {

    if (_bots[bot.config.token]) {
      // already online; do nothing.
    } else {
      bot.startRTM(function(err) {
        if (!err) {
          trackBot(bot);
        }

        bot.startPrivateConversation({user: config.createdBy},function(err,convo) {
          if (err) {
            console.log(err);
          } else {
            convo.say('Hello. I am the bot that is going to inspire you and your team when you need it the most. Just use @quote text (text is optional). /quote also works!');
            convo.say('Do not forget to /invite me to a channel so that I can delight you with my quotes!');
          }
        });

      });
    }
  });

  controller.on('create_incoming_webhook',function(bot,webhook_config) {
    bot.sendWebhook({
      text: 'Quoty is on its way! :thumbsup:'
    });
  })

  controller.hears(['^@quote$','^@quote (.*)'],'direct_message,direct_mention,ambient',function(bot,message) {  
      var author = (typeof message.match[1] === 'undefined') ? "random" : message.match[1] ;
      processQuote(author, message, bot.reply);
  });

  controller.on('slash_command',function(bot,message) {
      var author = (message.text === '') ? "random" : message.text;
      processQuote(author, message, bot.replyPublic);
  });

  function processQuote(author, message, cb) {
      unirest.get("https://yusufnb-quotes-v1.p.mashape.com/widget/~" + author + ".json").
      header("X-Mashape-Key", "6D764N9ZTimshCBK3UVgabOCBdNXp11HyxNjsnXI7Zvg0NYklX").
      header("Accept","application/json").end(function (result) {        
          var quote = result.body;

          if (!quote.quote) 
            cb(message, "Looks like I couldn't find anything of your interest :cry:")
          
          else 
            cb(message, quote.quote.trim() + " - " + quote.by);
      });  
  }

  controller.storage.teams.all(function(err,teams) {
    if (err)
      throw new Error(err);

    // connect all teams with bots up to slack!
    for (var t  in teams) {
      if (teams[t].bot) {
        controller.spawn(teams[t]).startRTM(function(err, bot) {
          if (err) {
            console.log('Error connecting bot to Slack:',err);
          } else {
            trackBot(bot);
          }
        });
      }
    }

  });

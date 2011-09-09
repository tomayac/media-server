var http = require('http');
var https = require('https');
var querystring = require('querystring');
var request = require('request');
var jsdom = require('jsdom');

var Step = require('./step.js');
var Uri = require('./uris.js');

// jspos
var Lexer = require('./jspos/lexer.js');
var POSTagger = require('./jspos/POSTagger.js');

var express = require('express');
var app = express.createServer();

app.configure(function() {
  app.use(express.methodOverride());
});

app.configure('development', function() {
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function() {
  app.use(express.errorHandler());
});

var GLOBAL_config = {
  DEBUG: true,
  MOBYPICTURE_KEY: 'TGoRMvQMAzWL2e9t',
  FLICKR_SECRET: 'a4a150addb7d59f1',
  FLICKR_KEY: 'b0f2a04baa5dd667fb181701408db162',
  YFROG_KEY: '89ABGHIX5300cc8f06b447103e19a201c7599962',
  INSTAGRAM_KEY: '82fe3d0649e04c2da8e38736547f9170',
  INSTAGRAM_SECRET: '4cf97de2075c4c8fbebdde57c5f9705a',
  GOOGLE_KEY: 'AIzaSyC5GxhDFxBHTKCLNMYtYm6o1tiagi65Ufc',
  HEADERS: {
    "Accept": "application/json, text/javascript, */*",
    "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
    "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",    
    "Referer": "http://www.google.com/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2",
  },
  MEDIA_PLATFORMS: [
    'yfrog.com',
    'instagr.am',
    'flic.kr',
    'moby.to',
    'youtu.be',
    'twitpic.com',
    'lockerz.com',
    'picplz.com',
    'qik.com',
    'ustre.am',
    'twitvid.com',
    'photobucket.com',
    'pic.twitter.com'],
  URL_REGEX: /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/ig,
  HASHTAG_REGEX: /(^|\s)\#(\S+)/g,
  USER_REGEX: /(^|\W)\@([a-zA-Z0-9_]+)/g
};

app.get(/^\/search\/(.+)\/(.+)$/, search);

function search(req, res, next) {  
  /** 
   * Stolen from https://developer.mozilla.org/en/JavaScript/Reference/Global_-
   * Objects/Date#Example:_ISO_8601_formatted_dates
   */
  function getIsoDateString(d) {  
   function pad(n) { return n < 10 ? '0' + n : n }
   d = new Date(d);
   return d.getUTCFullYear() + '-' +
        pad(d.getUTCMonth() + 1) + '-' +
        pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours()) + ':' +
        pad(d.getUTCMinutes()) + ':' +
        pad(d.getUTCSeconds()) + 'Z';
  }
  
  /**
   * Cleans video URLs, tries to convert YouTube URLS to HTML5 versions
   */
  function cleanVideoUrl(url, callback) {
    // if is YouTube URL
    if ((url.indexOf('http://www.youtube.com') === 0) || 
        (url.indexOf('https://www.youtube.com') === 0)) {
      try {
        var urlObj = new Uri(url);
        var host = urlObj.heirpart().authority().host();
        var path = urlObj.heirpart().path();
        var pathComponents = path.split(/\//gi);    
        var videoId;
        if (pathComponents[1] === 'v') {
          // URL of 'v' type:
          // http://www.youtube.com/v/WnszesKUXp8
          videoId = pathComponents[2];
        } else if (pathComponents[1] === 'watch') {   
          // URL of "watch" type:
          // http://www.youtube.com/watch?v=EVBsypHzF3U
          var query = urlObj.querystring();
          query.substring(1).split(/&/gi).forEach(function(param) {
            var keyValue = param.split(/=/gi);
            if (keyValue[0] === 'v') {
              videoId = keyValue[1];            
            }
          });        
        }
        // Translate to HTML5 video URL, try at least
        Step(
          function() {
            var that = this;
            var options = {
              url: 'http://tomayac.com/youpr0n/getVideoInfo.php?video=' +
                  videoId
            }
            request.get(options, function(err, res, body) {
              that(null, body);
            });
          },
          function(err, body) {
            var response = JSON.parse(body);
            var html5Url = false;
            for (var i = 0, len = response.length; i < len; i++) {
              var data = response[i];
              if (data.type.indexOf('video/webm') === 0) {
                html5Url = data.url;
                break;
              }
            }
            // if either embedding forbidden or no HTML5 version available,
            // use the normalized YouTube URL
            if (!html5Url) {
              html5Url = 'http://www.youtube.com/watch?v=' + videoId;
            }
            callback(html5Url);
          }
        );        
      } catch(e) {
        callback(url);
      }
    } else {
      callback(url);      
    }
  }
  
  /**
   * Replaces HTML entities
   */
  function replaceHtmlEntities(message) {
    message = message.replace(/&quot;/gi, '\"');      
    message = message.replace(/&apos;/gi, '\'');      
    message = message.replace(/&amp;/gi, '&');  
    message = message.replace(/&gt;/gi, '>');  
    message = message.replace(/&lt;/gi, '<');  
    message = message.replace(/&#39;/gi, '\'');  
    return message;    
  }

  /**
   * Removes line breaks, double spaces, etc.
   */
  function cleanMessage(message) {
    if (message) {
      message = message.replace(/[\n\r\t]/gi, ' ').replace(/\s+/g, ' ');
      message = replaceHtmlEntities(message);
      var cleanMessage = message.replace(GLOBAL_config.URL_REGEX, ' ');      
      cleanMessage = cleanMessage.replace(GLOBAL_config.HASHTAG_REGEX, ' $2');
      cleanMessage = cleanMessage.replace(GLOBAL_config.USER_REGEX, ' $2');
      cleanMessage = cleanMessage.replace(/\s+/g, ' ');
      return {
        text: message,
        clean: cleanMessage
      };          
    }
  }
  
  /**
   * Annotates messages with DBpedia Spotlight
   */  
  function spotlight(json) {    
    if (GLOBAL_config.DEBUG) console.log('spotlight');    
    var currentService = 'spotlight';
    var options = {
      headers: {
        "Accept": 'application/json'
      },
      body: ''     
    };  
    var collector = {};
    var httpMethod = 'GET';
    options.method = httpMethod;
    Step(
      function() {
        var group = this.group();
        var services = typeof(json) === 'object' ? Object.keys(json) : {};
        services.forEach(function(serviceName) {                    
          var service = json[serviceName];
          collector[serviceName] = [];
          service.forEach(function(item, i) {              
            var text;
            if ((item.message.translation.text) &&
                (item.message.translation.language !== 'en')) {            
              // for non-English texts, use the translation if it exists
              text = item.message.translation.text;        
            } else {
              // use the original version
              text = item.message.clean;
            } 
            if (httpMethod === 'POST') {        
              options.headers['Content-Type'] =
                  'application/x-www-form-urlencoded; charset=UTF-8';              
              options.url = 'http://spotlight.dbpedia.org/rest/annotate';
              options.body =
                  'text=' + encodeURIComponent(text) + 
                  '&confidence=0.2&support=20';            
            } else {
              options.url = 'http://spotlight.dbpedia.org/rest/annotate' +
                  '?text=' + encodeURIComponent(text) + 
                  '&confidence=0.2&support=20';                          
            }
            var cb = group();  
            request(options, function(err, res, body) {
              if (!err && res.statusCode === 200) {
                var response;
                try {
                  response = JSON.parse(body);
                } catch(e) {
                  // error
                  collector[serviceName][i] = [];   
                  cb(null);
                  return;
                }                    
                if (response.Error || !response.Resources) {
                  // error            
                  collector[serviceName][i] = [];
                  cb(null);            
                  return;
                }
                var entities = [];      	              
                if (response.Resources) {                
                  var uris = {};
                  var resources = response.Resources;
                  for (var j = 0, len2 = resources.length; j < len2; j++) {
                    var entity = resources[j];              
                    // the value of entity['@URI'] is not unique, but we only
                    // need it once, we simply don't care about the other
                    // occurrences
                    var currentUri = entity['@URI'];
                    if (!uris[currentUri]) {
                      uris[currentUri] = true;
                      entities.push({
                        name: entity['@surfaceForm'],
                        relevance: parseFloat(entity['@similarityScore']),
                        uris: [{
                          uri: currentUri,
                          source: currentService
                        }],
                        source: currentService
                      });                                        
                    }
                  }                            
                }   
                // success
                collector[serviceName][i] = entities;
              } else {
                // error
                collector[serviceName][i] = [];
              }
              cb(null);            
            });          
          });   
        });         
      },
      function(err) {     
        var services = typeof(json) === 'object' ? Object.keys(json) : {};
        services.forEach(function(serviceName) {          
          var service = json[serviceName];
          service.forEach(function(item, i) {  
            item.message.entities = collector[serviceName][i];
            
            // part of speech tagging
            var words;
            if ((item.message.translation.text) &&
                (item.message.translation.language !== 'en')) {            
              // for non-English texts, use the translation if it exists    
              words = new Lexer().lex(item.message.translation.text);
            } else {
              words = new Lexer().lex(item.message.clean);              
            }  
            var taggedWords = new POSTagger().tag(words);                        
            var result = [];
            for (var j = 0, len = taggedWords.length; j < len; j++) {
              var taggedWord = taggedWords[j];
              if ((taggedWord[1] === 'NNS') ||
                  (taggedWord[1] === 'NNPS') ||
                  (taggedWord[1] === 'NNP')) {
                var word = taggedWord[0];
                var tag = taggedWord[2];
                result.push({
                  word: word.toLowerCase(),
                  tag: tag
                });
              }
              item.message.nouns = result;            
            }
          });
        });
        sendResults(json);
      }  
    );        
  }

  /**
   * Translates messages one by one
   */
  function translate(json) {
    if (GLOBAL_config.DEBUG) console.log('translate');    
    var options = {
      headers: {
        "X-HTTP-Method-Override": 'GET',
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      method: 'POST',
      url: 'https://www.googleapis.com/language/translate/v2',
      body: 'key=' + GLOBAL_config.GOOGLE_KEY + '&target=en'
    };  
    var collector = {};
    Step(
      function() {
        var group = this.group();
        var services = typeof(json) === 'object' ? Object.keys(json) : {};
        services.forEach(function(serviceName) {          
          var cb = group();                    
          var service = json[serviceName];
          collector[serviceName] = [];
          service.forEach(function(item, i) {  
            var text = item.message.clean;        
            options.body += '&q=' + encodeURIComponent(text);
            collector[serviceName][i] = {
              text: '',
              language: ''
            };               
          });
          request(options, function(err, res, body) {    
            if (!err && res.statusCode === 200) {
              var response;
              try {
                response = JSON.parse(body);
              } catch(e) {
                // error
                cb(null);
                return;
              }                    
              if ((response.data) &&
                  (response.data.translations) &&
                  (Array.isArray(response.data.translations))) {                
                response.data.translations.forEach(function(translation, j) {                    
                  collector[serviceName][j] = {
                    text: replaceHtmlEntities(translation.translatedText),
                    language: translation.detectedSourceLanguage
                  };
                });
              }
              cb(null);            
            } else {
              // error
              cb(null);
              return;              
            }
          });                              
        });         
      },
      function(err) {   
        var services = typeof(json) === 'object' ? Object.keys(json) : {};
        services.forEach(function(serviceName) {          
          var service = json[serviceName];
          service.forEach(function(item, i) {  
            item.message.translation = collector[serviceName][i];
          });
        });
        spotlight(json);
      }  
    );   
  } 
  
  /**
   * Collects results to be sent back to the client
   */
  function collectResults(json, service, pendingRequests) {
    if (GLOBAL_config.DEBUG) console.log('collectResults');    
    if (!pendingRequests) {
      if (service !== 'combined') {
        var temp = json;
        json = {};
        json[service] = temp;
      }
      translate(json);      
    } else {
      pendingRequests[service] = json;
    }
  }
  
  /**
   * Sends results back to the client
   */
  function sendResults(json) {
    if (GLOBAL_config.DEBUG) console.log('sendResults');    
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.query.callback) {      
      res.send(req.query.callback + '(' + JSON.stringify(json) + ')');      
    } else {
      res.send(json);
    }    
  }
    
  var path = /^\/search\/(.+)\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  var query = decodeURIComponent(pathname.replace(path, '$2'));  

  var services = {    
    facebook: function(pendingRequests) {      
      var currentService = 'facebook';  
      if (GLOBAL_config.DEBUG) console.log(currentService);       
      var params = {
        q: query
      };
      params = querystring.stringify(params);
      var options = {
        host: 'graph.facebook.com',
        port: 443,
        path: '/search?' + params + '&type=post',
        headers: GLOBAL_config.HEADERS
      };
      https.get(options, function(reply) { 
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {   
          response = JSON.parse(response);
          var results = [];
          if ((response.data) && (response.data.length)) {
            var items = response.data;
            Step(
              function() {
                var group = this.group();            
                items.forEach(function(item) {
                  if (item.type !== 'photo' && item.type !== 'video') {
                    return;
                  }
                  var cb = group();
                  var timestamp = Date.parse(item.created_time);
                  var message = '';
                  message += (item.name ? item.name : '');
                  message += (item.caption ?
                      (message.length ? '. ' : '') + item.caption : '');
                  message += (item.description ?
                      (message.length ? '. ' : '') + item.description : '');
                  message += (item.message ?
                      (message.length ? '. ' : '') + item.message : '');                            
                  var mediaUrl = item.type === 'video' ?
                      item.source : item.picture;
                  cleanVideoUrl(mediaUrl, function(cleanedMediaUrl) {
                    results.push({
                      storyurl:
                          'https://www.facebook.com/permalink.php?story_fbid=' + 
                          item.id.split(/_/)[1] + '&id=' + item.from.id,
                      mediaurl: cleanedMediaUrl,
                      message: cleanMessage(message),
                      user:
                          'https://www.facebook.com/profile.php?id=' +
                          item.from.id,
                      type: item.type,
                      timestamp: timestamp,
                      published: getIsoDateString(timestamp)
                    });
                    cb(null);
                  });
                });
              },
              function(err) {
                collectResults(results, currentService, pendingRequests);                
              }
            );              
          } else {
            collectResults(results, currentService, pendingRequests);                            
          }          
        });
      }).on('error', function(e) {
        collectResults([], currentService, pendingRequests);
      });
    },
    twitter: function(pendingRequests) {
      var currentService = 'twitter';  
      if (GLOBAL_config.DEBUG) console.log(currentService);              
      var params = {
        q: query + ' ' + GLOBAL_config.MEDIA_PLATFORMS.join(' OR ') + ' -"RT "'
      };
      params = querystring.stringify(params);
      var options = {
        host: 'search.twitter.com',
        port: 80,
        path: '/search.json?' + params,
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) { 
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {   
          response = JSON.parse(response);
          var results = [];
          if ((response.results) && (response.results.length)) {
            var items = response.results;
            var itemStack = [];            
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              // extract all URLs form a tweet
              var urls = [];
              text = item.text.replace(GLOBAL_config.URL_REGEX, function(url) {
                var targetURL = (/^\w+\:\//.test(url) ? '' : 'http://') + url;
                urls.push(targetURL);
              });              
              // for each URL prepare the options object
              var optionsStack = [];                    
              for (var j = 0, len2 = urls.length; j < len2; j++) {
                var url = urls[j];
                var urlObj = new Uri(url);
                var options = {
                  host: urlObj.heirpart().authority().host(),
                  method: 'HEAD',
                  port: (url.indexOf('https') === 0 ? 443 : 80),
                  path: urlObj.heirpart().path() +
                      (urlObj.querystring() ? urlObj.querystring() : '') +
                      (urlObj.fragment() ? urlObj.fragment() : ''),
                  headers: GLOBAL_config.HEADERS
                };
                optionsStack[j] = options;
              }              
              itemStack[i] = {
                urls: urls,
                options: optionsStack,
                item: item                
              };
            }
            // for each tweet retrieve all URLs and try to expand shortend URLs
            Step(            
              function() {              
                var group = this.group();
                itemStack.forEach(function (obj) {
                  obj.options.forEach(function(options) {
                    var cb = group();
                    if (options.port === 80) {
                      var url = 'http://' + options.host + options.path;    
                      http.get(options, function(reply2) {
                        cb(null, {
                          req: reply2,
                          url: url
                        });
                      }).on('error', function(e) {
                        cb(null, {
                          req: null,
                          url: url
                        });
                      });                    
                    } else if (options.port === 443) {
                      var url = 'https://' + options.host + options.path;    
                      https.get(options, function(reply2) {
                        cb(null, {
                          req: reply2,
                          url: url
                        });
                      }).on('error', function(e) {
                        cb(null, {
                          req: null,
                          url: url
                        });
                      });                                          
                    }  
                  });
                });       
              },     
              function(err, replies) { 
                /**
                 * Checks if a URL is one of the media platform URLs
                 */
                function checkForValidUrl(url) {
                  var host = new Uri(url).heirpart().authority().host();
                  return GLOBAL_config.MEDIA_PLATFORMS.indexOf(host) !== -1;
                }
                var locations = [];
                replies.forEach(function(thing, i) {
                  if ((thing.req.statusCode === 301) ||
                      (thing.req.statusCode === 302)) {    
                    if (checkForValidUrl(thing.req.headers.location)) {    
                      locations.push(thing.req.headers.location);
                    } else {
                      locations.push(false);
                    }
                  } else {
                    if (checkForValidUrl(thing.url)) {    
                      locations.push(thing.url);
                    } else {
                      locations.push(false);
                    }
                  }
                });
                var locationIndex = 0;
                for (var i = 0, len = itemStack.length; i < len; i++) {
                  var item = itemStack[i].item;
                  var timestamp = Date.parse(item.created_at);                  
                  var published = getIsoDateString(timestamp)
                  var message = cleanMessage(item.text);
                  var user = 'http://twitter.com/' + item.from_user;
                  itemStack[i].urls.forEach(function() {
                    if (locations[locationIndex]) {
                      results.push({
                        url: locations[locationIndex],
                        message: message,
                        user: user,
                        type: 'micropost',
                        timestamp: timestamp,
                        published: published
                      });                          
                    }
                    locationIndex++;
                  });
                }
                collectResults(results, currentService, pendingRequests);
              }
            );            
          } else {
            collectResults([], currentService, pendingRequests);
          }          
        });
      }).on('error', function(e) {
        collectResults([], currentService, pendingRequests);
      });               
    },
    instagram: function(pendingRequests) {
      var currentService = 'instagram';     
      if (GLOBAL_config.DEBUG) console.log(currentService);           
      var params = {
        client_id: GLOBAL_config.INSTAGRAM_KEY
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.instagram.com',
        port: 443,
        path: '/v1/tags/' +
            query.replace(/\s*/g, '').replace(/\W*/g, '').toLowerCase() +
            '/media/recent?' + params,
        headers: GLOBAL_config.HEADERS
      };
      https.get(options, function(reply) { 
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {   
          response = JSON.parse(response);
          var results = [];
          if ((response.data) && (response.data.length)) {
            var items = response.data;
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              var timestamp = parseInt(item.created_time + '000', 10);
              var message = '';
              message += (item.caption && item.caption.text ?
                  item.caption.text : '');
              message += (message.length ? '. ' : '') + 
                  (item.tags && Array.isArray(item.tags) ?
                      item.tags.join(', ') : '');
              results.push({
                url: item.images.standard_resolution.url,
                message: cleanMessage(message),
                user: 'https://api.instagram.com/v1/users/' + item.user.id,
                type: item.type === 'image'? 'photo' : '',
                timestamp: timestamp,
                published: getIsoDateString(timestamp)
              });
            }
          }
          collectResults(results, currentService, pendingRequests);
        });
      }).on('error', function(e) {
        collectResults([], currentService, pendingRequests);
      });                       
    },    
    youtube: function(pendingRequests) {
      var currentService = 'youtube';   
      if (GLOBAL_config.DEBUG) console.log(currentService);             
      var params = {
        v: 2,
        format: 5,
        safeSearch: 'none',
        q: query,
        alt: 'jsonc',
        'max-results': 10,
        'start-index': 1,
        time: 'this_week'        
      };
      params = querystring.stringify(params);
      var options = {
        host: 'gdata.youtube.com',
        port: 80,
        path: '/feeds/api/videos?' + params,
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);          
          var results = [];
          if ((response.data) && (response.data.items)) {
            var items = response.data.items;
            Step(
              function() {
                var group = this.group();            
                items.forEach(function(item) {
                  if (item.accessControl.embed !== 'allowed') {
                    return;
                  }
                  var cb = group();
                  var timestamp = Date.parse(item.uploaded);
                  var url = item.player.default;
                  cleanVideoUrl(url, function(cleanedVideoUrl) {
                    results.push({
                      mediaurl: cleanedVideoUrl,
                      storyurl: url,
                      message: cleanMessage(
                          item.title + '. ' + item.description),
                      user: 'http://www.youtube.com/' + item.uploader,
                      type: 'video',
                      timestamp: timestamp,
                      published: getIsoDateString(timestamp)
                    });                    
                    cb(null);
                  });
                });
              },
              function(err) {
                collectResults(results, currentService, pendingRequests);                
              }
            );              
          } else {
            collectResults(results, currentService, pendingRequests);                            
          }
        });
      }).on('error', function(e) {
        collectResults([], currentService, pendingRequests);
      });                       
    },
    flickrvideos: function(pendingRequests) {
      services.flickr(pendingRequests, true);
    },
    flickr: function(pendingRequests, videoSearch) {     
      var currentService = videoSearch ? 'flickrvideos' : 'flickr';         
      if (GLOBAL_config.DEBUG) console.log(currentService);       
      var now = new Date().getTime();
      var sixDays = 86400000 * 6;
      var params = {
        method: 'flickr.photos.search',
        api_key: GLOBAL_config.FLICKR_KEY,
        text: query,
        format: 'json',
        nojsoncallback: 1,
        min_taken_date: now - sixDays,
        media: (videoSearch ? 'videos' : 'photos'),
        per_page: 10
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.flickr.com',
        port: 80,
        path: '/services/rest/?' + params,
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          var results = [];
          if ((response.photos) && (response.photos.photo)) {
            var photos = response.photos.photo;
            Step(     
              function() {              
                var group = this.group();
                for (var i = 0, len = photos.length; i < len; i++) {
                  var photo = photos[i];
                  if (photo.ispublic) {                
                    var params = {
                      method: 'flickr.photos.getInfo',
                      api_key: GLOBAL_config.FLICKR_KEY,
                      format: 'json',
                      nojsoncallback: 1,
                      photo_id: photo.id
                    };
                    params = querystring.stringify(params);
                    var options = {
                      host: 'api.flickr.com',
                      port: 80,
                      path: '/services/rest/?' + params,
                      headers: GLOBAL_config.HEADERS
                    };
                    var cb = group();                
                    http.get(options, function(reply2) {        
                      var response2 = '';
                      reply2.on('data', function(chunk) {
                        response2 += chunk;
                      });
                      reply2.on('end', function() {      
                        response2 = JSON.parse(response2);                
                        var tags = [];
                        response2.photo.tags.tag.forEach(function(tag) {
                          tags.push(tag._content);
                        });
                        var photo2 = response2.photo;
                        var timestamp = Date.parse(photo2.dates.taken);
                        results.push({
                          url: 'http://www.flickr.com/photos/' +
                              photo2.owner.nsid + '/' + photo2.id + '/',
                          message: cleanMessage(photo2.title._content + '. ' +
                              photo2.description._content +
                              tags.join(', ')),
                          user: 'http://www.flickr.com/photos/' +
                              photo2.owner.nsid + '/',
                          type: (videoSearch ? 'video' : 'photo'),
                          timestamp: timestamp,
                          published: getIsoDateString(timestamp)
                        });
                        cb();             
                      });
                    }).on('error', function(e) {
                      cb();
                    });
                  }
                }
              },
              function() {
                collectResults(results, currentService, pendingRequests);
              }
            );
          } else {
            collectResults([], currentService, pendingRequests);
          }
        });
      }).on('error', function(e) {
        collectResults([], currentService, pendingRequests);
      });
    },
    mobypicture: function(pendingRequests) {
      var currentService = 'mobypicture';         
      if (GLOBAL_config.DEBUG) console.log(currentService);       
      var params = {
        key: GLOBAL_config.MOBYPICTURE_KEY,
        action: 'searchPosts',
        format: 'json',
        searchTerms: query
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.mobypicture.com',
        port: 80,
        path: '/?' + params,
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          var results = [];
          if ((response.results) && (response.results.length)) {
            var items = response.results;            
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              var timestamp = item.post.created_on_epoch;
              results.push({
                url: item.post.media.url_full,
                message: cleanMessage(
                    item.post.title + '. ' + item.post.description),
                user: item.user.url,
                type: item.post.media.type,
                timestamp: timestamp,
                published: getIsoDateString(timestamp)
              });
            }
          }
          collectResults(results, currentService, pendingRequests);
        });
      }).on('error', function(e) {
        collectResults([], currentService, pendingRequests);
      });
    },
    twitpic: function(pendingRequests) {   
      var currentService = 'twitpic';   
      if (GLOBAL_config.DEBUG) console.log(currentService);             
      var params = {
        type: 'mixed',
        page: 1,
        q: query
      };
      params = querystring.stringify(params);
      var options = {
        host: 'web1.twitpic.com',
        port: 80,
        path: '/search/show?' + params,
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          var results = [];
          if (response.length) {            
            Step(
              function() {
                var group = this.group();
                for (var i = 0, len = response.length; i < len; i++) {
                  var item = response[i];
                  var id = item.link.replace(/.*?\/(\w+)$/, '$1');
                  var params = {
                    id: id
                  };
                  params = querystring.stringify(params);
                  var options = {
                    host: 'api.twitpic.com',
                    port: 80,
                    path: '/2/media/show.json?' + params,
                    headers: GLOBAL_config.HEADERS
                  };
                  var cb = group();                  
                  http.get(options, function(reply2) {        
                    var response2 = '';
                    reply2.on('data', function(chunk) {
                      response2 += chunk;
                    });
                    reply2.on('end', function() {                            
                      if (response2) {
                        response2 = JSON.parse(response2);                  
                      } else {
                        cb();
                        return;
                      }
                      if (!response2.errors) {                      
                        var timestamp = Date.parse(response2.timestamp);
                        var options = {
                          url: 'http://twitpic.com/' +
                              response2.short_id + '/full'
                        };
                        request.get(options, function(err, res, body) {
                          jsdom.env(body, function(errors, window) {
                            var $ = window.document; 
                            var mediaUrl;
                            try {
                              mediaUrl = $.getElementsByTagName('IMG')[1].src;
                            } catch(e) {
                              console.log('Twitpic screen scraper broken');
                              mediaUrl = url;
                            }
                            results.push({
                              mediaurl: mediaUrl,
                              storyurl: 'http://twitpic.com/' +
                                  response2.short_id,
                              message: cleanMessage(response2.message), 
                              user: 'http://twitter.com/' +
                                  response2.user.username,
                              type: 'photo',
                              timestamp: timestamp,
                              published: getIsoDateString(timestamp)
                            });
                            cb();                            
                          });
                        });
                      } else {
                        cb();
                      }
                    });
                  }).on('error', function(e) {
                    cb();
                  });
                }
              },
              function() {
                collectResults(results, currentService, pendingRequests);
              }
            );
          } else {
            collectResults(results, currentService, pendingRequests);
          }
        });
      }).on('error', function(e) {
        collectResults([], currentService, pendingRequests);
      });
    }
  };
  if (services[service]) {
    services[service]();
  } 
  if (service === 'combined') {
    var serviceNames = Object.keys(services);
    var pendingRequests = {}
    serviceNames.forEach(function(serviceName) {
      pendingRequests[serviceName] = false;
      services[serviceName](pendingRequests); 
    });

    var length = serviceNames.length;
    var intervalTimeout = 500;
    var timeout = 40 * intervalTimeout;
    var passedTime = 0;
    var interval = setInterval(function() {
      passedTime += intervalTimeout;
      for (var i = 0; i < length; i++) {
        if (passedTime >= timeout) {
          break;
        }
        if (pendingRequests[serviceNames[i]] === false) {
          return;
        }
      }
      clearInterval(interval);
      var results = pendingRequests;
      collectResults(results, 'combined', false);
      pendingRequests = {};
    }, intervalTimeout);    
  } 
}

var port = process.env.PORT || 8001;
app.listen(port);
console.log('node.JS running on ' + port);
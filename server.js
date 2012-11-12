var mediaFinder = require('./mediafinder.js');
var express = require('express');
var app = express.createServer();

app.configure(function() {
  app.use(express.methodOverride());
  app.use(express.static(__dirname + '/'));
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

app.get(/^\/search\/(.+)\/(.+)$/, search);

function search(req, res, next) {
  // actual code begins, up to here we only had helper functions
  var path = /^\/search\/(.+)\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  var query = decodeURIComponent(pathname.replace(path, '$2'));
  mediaFinder.search(service, query, function(json) {
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With');
    if (req.query.callback) {
      res.send(req.query.callback + '(' + JSON.stringify(json) + ')');
    } else {
      res.send(json);
    }
  });
}

var port = process.env.PORT || 8001;
app.listen(port);
console.log('node.JS running on ' + port);
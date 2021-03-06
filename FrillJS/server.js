'use strict';

//process.on("uncaughtException", function (ex) {
//  logger.appError("Unhandled exception. Shutting down.", ex);
//  console.log(ex);
//  setTimeout(function () {
//    process.exit(-1);
//  }, 200);
//});
//process.on('unhandledRejection', function (reason, p) {
//  applog.appError("Unhandled rejection. Shutting down.", reason);
//  console.log(reason);
//  setTimeout(function () {
//    process.exit(-1);
//  }, 200);
//});

var express = require("express");
var bodyParser = require("body-parser");
var url = require('url');

// Set up server
var app = express();
app.set("view engine", "ejs");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public", { maxage: "365d" }));
var routes = require("./routes.js")(app);
var server = require('http').createServer();
server.on('request', app);

// Init websockets server
var wsServer = require('./logic/ws-server')(server);
server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;
  if (pathname === '/data') {
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws);
    });
  } else socket.destroy();
});

// Serve.
var port = process.env.PORT || 3030;
server.listen(port, function () {
  console.log(`HTTP/WS server listening on ${port}`);
});

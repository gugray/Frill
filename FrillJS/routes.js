'uses strict';
var pjson = require("./package.json");

var routes = function (app) {

  app.get('/', function (req, res) {
    res.render(__dirname + "/index.ejs", {
      prod: process.env.NODE_ENV == "production",
      ver: pjson.version
    });
  });

};

module.exports = routes;


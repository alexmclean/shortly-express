var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs');
var session = require('express-session');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

var sessionStore = new session.MemoryStore();
app.use(session({ store: sessionStore, secret: 'keyboard cat', cookie: { maxAge: 30/*min*/*1000*60 }}))

var authenticatedSessions = {};
app.get('/', 
function(req, res) {
  if(util.checkUser(authenticatedSessions, req.session.id)){
      res.render('index');
  } else {
      res.render('login');
  }
});

app.get('/create', 
function(req, res) {
  if(util.checkUser(authenticatedSessions, req.session.id)){
      res.render('index');
  } else {
      res.render('login');
  }
});

app.get('/links', 
function(req, res) {
  if(util.checkUser(authenticatedSessions, req.session.id)){
    console.log("user id ", authenticatedSessions[req.session.id]);
    Links.reset().query('where', 'user_id', '=', authenticatedSessions[req.session.id] + '').fetch().then(function(links) {  
      res.send(200, links.models);
    });
  } else {
    res.render('login');
  }
});

app.get('/signup',
function(req, res){
  res.render('signup');
});

app.get('/logout', function(req, res){
  console.log("rerouted to logout!!");
  authenticatedSessions[req.session.id] = false;
  res.redirect('/');
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri, user_id: authenticatedSessions[req.session.id] }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        Links.create({
          url: uri,
          title: title,
          base_url: req.headers.origin,
          user_id: authenticatedSessions[req.session.id] 
        })
        .then(function(newLink) {
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.post('/signup',
function(req, res) {
  var username = req.body.username;
  var password = req.body.password;
  bcrypt.genSalt(10, function(err, salt) {
    bcrypt.hash(password, salt, 
      function(){},
      function(err, hash) {
        // Store hash in your password DB.
        console.log('Password: ' + hash + ', Salt: ' + salt);
        Users.create({
          username: username,
          password: hash,
          salt: salt
        })
        .then(function(model){
          authenticatedSessions[req.session.id] = model.get('id');
          console.log(authenticatedSessions[req.session.id]);
          res.redirect('/');
          
        });
    });
  });
});

app.post('/login',
function(req, res){
  var username = req.body.username;
  var password = req.body.password;
  new User({username: username}).fetch()
  .then(function(model){
    if(model){
      bcrypt.hash(password, model.get('salt'), 
      function(){},
      function(err, hash) {
        // Store hash in your password DB.
        console.log('Password: ' + hash + ', Salt: ' + model.get('salt'));
        if(hash === model.get('password')){
          authenticatedSessions[req.session.id] = model.get('id');
          res.redirect('/');
        } else {
          res.status(404).send("Incorrect Password");
        }
      });
    } else {
      //TODO redirect
      res.status(404).send("Model Not Found");
    }
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits')+1);
        link.save().then(function() {

          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);

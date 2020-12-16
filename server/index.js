const express = require('express');
const bodyParser = require('body-parser');
const pino = require('express-pino-logger')();
require('dotenv').config({path: __dirname+'/.env'})
const request = require('request');
const io = require('socket.io-client');
var socket = io.connect(process.env.REACT_APP_SOCKET);
console.log(process.env.REACT_APP_SOCKET)

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(pino);

app.get('/login', function(req, res) {
  var room = req.param("room")
	var client_id = process.env.CLIENT_ID
	var redirect_uri = process.env.REDIRECT_URL
  var scopes = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative, user-read-currently-playing user-modify-playback-state'
  res.redirect('https://accounts.spotify.com/authorize' + 
    '?response_type=code' +
  	'&client_id=' + client_id +
    '&state=' + room +
  	(scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
  	'&redirect_uri=' + encodeURIComponent(redirect_uri));
});

app.get('/auth', function(req, res) {
	var code = req.param("code")
  var room = req.param("state")
	var client_id = process.env.CLIENT_ID
	var client_secret = process.env.CLIENT_SECRET
	var redirect_uri = process.env.REDIRECT_URL
	var app_uri = process.env.APP_URI
	var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code: code,
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code'
    },
    headers: {
      'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
    },
    json: true
  }

  request.post(authOptions, function(error, response, body) {
  	if (!error && response.statusCode === 200) {
  		res.redirect(app_uri + 
  			'/' + room + '/' + body.access_token + '/' + body.refresh_token
			)
  	}
	})
});	

app.get('/create-room', function(req, res) {
  var client_id = process.env.ROOM_CLIENT_ID
  var redirect_uri = process.env.ROOM_REDIRECT_URL
  var room = Math.random().toString(36).substring(7);
  var scopes = 'user-read-private user-read-email user-read-currently-playing user-modify-playback-state'
  res.redirect('https://accounts.spotify.com/authorize' + 
    '?response_type=code' +
    '&client_id=' + client_id +
    '&state=' + room +
    (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
    '&redirect_uri=' + encodeURIComponent(redirect_uri));
});

app.get('/room-auth', function(req, res) {
  console.log("ROOM-AUTH")
  var code = req.param("code")
  var room = req.param("state")

  var client_id = process.env.ROOM_CLIENT_ID
  var client_secret = process.env.ROOM_CLIENT_SECRET
  var redirect_uri = process.env.ROOM_REDIRECT_URL
  var app_uri = process.env.ROOM_APP_URI
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code: code,
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code'
    },
    headers: {
      'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
    },
    json: true
  }

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      console.log(body.access_token)
      console.log(body.refresh_token)
      socket.emit('room', {room: room, access_token: body.access_token, refresh_token: body.refresh_token});
      res.redirect(app_uri + '/' + room)
    }
  })
}); 

app.listen(3001, () => {
  console.log('Express server is running on localhost:3002');
});

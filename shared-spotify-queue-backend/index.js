
var io = require('socket.io')(3002, {
  pingTimeout: 60000,
});
const request = require('request');
require('dotenv').config({path: __dirname+'/.env'})
const { v4: uuidv4 } = require('uuid');

room_to_creds = {}
room_to_queue = {}

socket_to_user = {}

io.on('connection', function (socket) {
  // @param room
  // @param access_token
  // @param refresh_token
  socket.on('room', function (message) {
    room = message['room'];
    access_token = message['access_token'];
    refresh_token = message['refresh_token'];

    room_to_creds[room] = {access_token: access_token, refresh_token: refresh_token}
    if (!(room in room_to_queue)) {
      room_to_queue[room] = {currently_playing: {}, queue: []}
    }
  });

  socket.on('get rooms', function (message) {
    socket.emit('all rooms', Object.keys(room_to_queue))
  });

  socket.on('delete song', function (message) {
    room = message['room'];
    id = message['id'];

    if (room in room_to_queue) {
      curr_queue = room_to_queue[room]["queue"]
      room_to_queue[room]["queue"] = curr_queue.filter(function( obj ) {
        return obj.id !== id;
      });

      io.in(room).emit('queue', room_to_queue[room]);
    }
  });

  socket.on('vote', function (message) {
    room = message['room'];
    id = message['id'];
    count = message['count']
    if (room in room_to_queue) {
      obj = room_to_queue[room]["queue"].find(item => item.id === id);
      if(obj) {
        obj.votes += count
        room_to_queue[room]["queue"].sort(function (a,b) {
          if (a.votes > b.votes) return -1;
          if (a.votes < b.votes) return 1;
          return 0;
        });
        io.in(room).emit('queue', room_to_queue[room]);
      }
    }
  });

  socket.on('join room', function (message) {
    room = message['room'];
    user = message['user'];

    socket_to_user[socket.id] = user;
    socket.join(room);
    socket.broadcast.to(room).emit('joined', user);
    if (room in room_to_queue) {
      io.in(room).emit('queue', room_to_queue[room]);
    } else {
      console.log("room " + room + " doesn't exist")
    }
  });

  socket.on('add', function (message) {
    room = message["room"];
    selectedOption = message["selectedOption"];
    selectedOption.id = uuidv4();
    selectedOption.votes = 0;
    if (room in room_to_queue) {
      room_to_queue[room]["queue"].push(selectedOption);
      io.in(room).emit('queue', room_to_queue[room]);
    }
  });

  socket.on('get rooms', function () {
    socket.emit("rooms", Object.keys(room_to_queue));
  });

  socket.on('delete room', function (message) {
    room = message["room"]
    delete room_to_queue[room]
    delete room_to_creds[room]
    console.log("deleted room " + room);
    io.in(room).emit('queue', {currently_playing: {}, queue: []});
  });

  socket.on('pause', function (message) {
    room = message["room"]
    if (room in room_to_creds) {
      const req = {
        url: 'https://api.spotify.com/v1/me/player/pause',
        headers: {
          'Authorization': 'Bearer ' + room_to_creds[room]["access_token"],
        },
        json: true
      }
      request.put(req, function(error, response, body) {
        if(error || response.statusCode != 204) {
          console.log("pause " + error);
        }
      })
    }
  });

  socket.on('play', function (message) {
    room = message["room"]
    if (room in room_to_creds) {
      const req = {
        url: 'https://api.spotify.com/v1/me/player/play',
        headers: {
          'Authorization': 'Bearer ' + room_to_creds[room]["access_token"],
        },
        json: true
      }
      request.put(req, function(error, response, body) {
        if (error || response.statusCode != 204) {
          console.log("play ", error);
        }
      })
    }
  });

  socket.on('next', function (message) {
    room = message["room"]
    if (room in room_to_queue) {
      queue = room_to_queue[room]["queue"]
      if (queue.length > 0 && room_to_queue[room]["currently_playing"] != undefined) {
        room_to_queue[room]["currently_playing"]["next"] = true
      }
    }
  })

  socket.on('disconnect', function () {
    console.log('user disconnected');
  });
});

setInterval(() => {
  try {
    for (const room in room_to_queue) {
      queue = room_to_queue[room]["queue"]

      if (queue !== undefined && (queue.length > 0 || (room_to_queue[room]["currently_playing"] != undefined && room_to_queue[room]["currently_playing"]["progress"] != -1))) {
        const req = {
          url: 'https://api.spotify.com/v1/me/player/currently-playing',
          headers: {
            'Authorization': 'Bearer ' + room_to_creds[room]["access_token"],
          },
          json: true
        }

        request.get(req, function(error, response, body) {
          try {
            if (!error && (response.statusCode == 200 || response.statusCode == 204)) {
              if(body === undefined) {
                currently_playing_song = null;
                progress = -1;
                is_playing = false;
              } else {
                currently_playing_song = body["item"]["uri"];
                progress = body["progress_ms"];
                is_playing = body["is_playing"];
              }
              is_not_playing = (is_playing === false && progress === 0)
              if (room_to_queue[room]["currently_playing"] != undefined) {
                room_to_queue[room]["currently_playing"]["progress"] = progress
                room_to_queue[room]["currently_playing"]["is_playing"] = is_playing
              }
              io.in(room).emit('queue', room_to_queue[room])
              if (queue.length > 0 && (is_not_playing || (room_to_queue[room]["currently_playing"] && (currently_playing_song != null && currently_playing_song !== room_to_queue[room]["currently_playing"]["uri"])) || (room_to_queue[room]["currently_playing"] && room_to_queue[room]["currently_playing"]["next"]))) {
                next_track = room_to_queue[room]["queue"].shift()
                if(next_track) {
                  const new_song_req = {
                    url: 'https://api.spotify.com/v1/me/player/play',
                    headers: {
                      'Authorization': 'Bearer ' + room_to_creds[room]["access_token"],
                    },
                    json: {
                      "uris": [next_track["uri"]]
                    },
                  }

                  request.put(new_song_req, function(error, response, body) {
                    try {
                      if (!error && response.statusCode === 204) {
                        if (room in room_to_queue) {
                          room_to_queue[room]["currently_playing"] = next_track
                          io.in(room).emit('queue', room_to_queue[room]);
                        }
                      }
                      console.log(response.statusCode)
                    } catch (err) {
                      console.log("error from play next " + err)
                    }
                  })
                }
              }
            } else {
              console.log(response.statusCode)
              var client_id = process.env.ROOM_CLIENT_ID
              var client_secret = process.env.ROOM_CLIENT_SECRET
              var authOptions = {
                url: 'https://accounts.spotify.com/api/token',
                form: {
                  grant_type: 'refresh_token',
                  refresh_token: room_to_creds[room].refresh_token,

                },
                headers: {
                  'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
                },
                json: true
              }

              request.post(authOptions, function(error, response, body) {
                if (!error && response.statusCode === 200) {
                  console.log(body.access_token)
                  room_to_creds.access_token = body.access_token
                }
              })
            }
          } catch (err) {
            console.log("error from current song " + err)
          }
        })
      }
    }
  } catch (err) {
    console.log("error from setInterval " + err)
  };
}, 1500)

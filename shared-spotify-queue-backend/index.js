
var io = require('socket.io')(3002, {
  pingTimeout: 60000,
});
const request = require('request');
require('dotenv').config({path: __dirname+'/.env'})
const ULID = require('ulid')
const Redis = require("ioredis");
const redis = new Redis({ showFriendlyErrorStack: true });

room_to_queue = {}
socket_to_user = {}

function sendQueue(room) {
  redis.zrange(`${room}:queue`, 0, -1, function (err, result) {
    multi = redis.multi()
    for(id of result) {
      multi
        .hgetall(`${room}:queue:song:${id}`)
        .smembers(`${room}:queue:song:${id}:upvotes`)
        .smembers(`${room}:queue:song:${id}:downvotes`)
    }

    multi.hgetall(`${room}:current_song`)
    multi.hgetall(`${room}:owner`)

    multi.exec(function(err, results) {
      queue = []
      if (results.length > 1) {
        for(var i = 0; i < Math.floor(results.length/3); i++) {
          index = i * 3
          song = results[index][1]
          try {
            song.user = JSON.parse(song.user)
          } catch(err) {
            console.log(err)
            console.log(song)
            console.log("broken")
            song.user = {}
          }
          song.upvotes = results[index+1][1].map(x => JSON.parse(x))
          song.downvotes = results[index+2][1].map(x => JSON.parse(x))
          queue.push(song)
        }
      }

      current_song = results[results.length - 2][1]
      owner = results[results.length - 1][1]
      if (current_song.user) {
        current_song.user = JSON.parse(current_song.user)
        current_song.is_playing = current_song.is_playing === "true"
      }
      io.in(room).emit('queue', {currently_playing: current_song, queue: queue, owner: owner});
    });
  })
    
}

function playSongForConnectedUser(room, track, user_id, progress_ms = "0") {
  redis.hgetall(`${room}:connected-user:${user_id}`, function(error1, result) {
    access_key = result.access_key
    refresh_key = result.refresh_key

    const new_song_req = {
      url: 'https://api.spotify.com/v1/me/player/play',
      headers: {
        'Authorization': 'Bearer ' + access_key,
      },
      json: {
        "uris": [track],
        "position_ms": parseInt(progress_ms)
      },
    }
    request.put(new_song_req, function(error2, response, body) {
      if (response.statusCode == 404 || response.statusCode == 400 || response.statusCode == 429) {
        console.log("not found " + user_id + " " + response.statusCode)
        return
      }
      if (error2 || (response.statusCode == 401)) {
        console.log("error2 " + error2 + "response.StatusCode " + response.statusCode)
        console.log(response.statusCode)
        var client_id = process.env.CLIENT_ID
        var client_secret = process.env.CLIENT_SECRET
        var authOptions = {
          url: 'https://accounts.spotify.com/api/token',
          form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_key,

          },
          headers: {
            'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
          },
          json: true
        }
        request.post(authOptions, function(error3, response2, body) {
          if (!error3 && response2.statusCode === 200) {
            redis.hset(`${room}:connected-user:${user_id}`, "access_key", body.access_token, function(error4, r) {
              playSongForConnectedUser(room, track, user_id)
            })
          }
        });
      }
    })
  })
}

function updateSongForEveryone(room, track) {
  redis.smembers(`${room}:shared-listen`, function(err, results) {
    for(user_id of results) {
      playSongForConnectedUser(room, track, user_id)
    }
  });
}

io.on('connection', function (socket) {
  // @param room
  // @param access_token
  // @param refresh_token
  socket.on('room', function (message) {
    room = message['room'];
    access_token = message['access_token'];
    refresh_token = message['refresh_token'];

    redis.sadd('rooms_set', room)
    redis.set(`${room}:access_token`, access_token)
    redis.set(`${room}:refresh_token`, refresh_token)

    const req = {
        url: 'https://api.spotify.com/v1/me',
        headers: {
          'Authorization': 'Bearer ' + access_token,
        },
        json: true
      }
      request.get(req, function(error, response, body) {
        if(error || response.statusCode >= 300) {
          console.log("error getting user " + response.statusCode + " " + error);
          request.get(req, function(e, r, b) {
            console.log("trying owner again")
            console.log(r.statusCode)
            redis.hset(`${room}:owner`, { id: b.id, name: b.display_name }, (err) => {
              console.log(err)
            });
          })
        } else {
          console.log("setting owner " + body.display_name + " " + room)
          redis.hset(`${room}:owner`, { id: body.id, name: body.display_name }, (err) => {
            console.log(err)
          });
          console.log("done setting owner " + body.display_name)
        }
      })
  });

  socket.on('get rooms', function (message) {
    redis.smembers("rooms_set", function (err, result) {
      if (err) {
        console.error(err);
        socket.emit('all rooms', []);
      } else {
        socket.emit('all rooms', result);
      }
    });  
  });

  socket.on('delete song', function (message) {
    room = message['room'];
    id = message['id'];

    redis
      .multi()
      .zrem(`${room}:queue`, id)
      .del(`${room}:queue:song:${id}`)
      .del(`${room}:queue:song:${id}:upvotes`)
      .del(`${room}:queue:song:${id}:downvotes`)
      .exec(function(err, results) {
        sendQueue(room)
      });
  });


  socket.on('vote', function (message) {
    room = message['room'];
    id = message['id'];
    count = message['count']
    user = message['user']
    multi = redis.multi()
    multi.zincrby(`${room}:queue`, (count * -1), id)
    if(count > 0) {
      multi.sadd(`${room}:queue:song:${id}:upvotes`, JSON.stringify(user))
      multi.srem(`${room}:queue:song:${id}:downvotes`, JSON.stringify(user))
    } else {
      multi.sadd(`${room}:queue:song:${id}:downvotes`, JSON.stringify(user))
      multi.srem(`${room}:queue:song:${id}:upvotes`, JSON.stringify(user))
    }
    multi.exec(function(err, result) {
      sendQueue(room);
    })
  });

  socket.on('join room', function (message) {
    room = message['room'];
    user = message['user'];

    if (!(room in socket_to_user)) {
      socket_to_user[room] = {};
    }

    socket_to_user[room][socket.id] = user;
    socket.join(room, () => {
      io.in(room).emit('users', socket_to_user[room]);
      sendQueue(room)
    });
  });

  socket.on('add', function (message) {
    room = message["room"];
    id = ULID.ulid();
    selectedOption = message["selectedOption"];
    selectedOption.id = id;
    selectedOption.upvotes = [];
    selectedOption.downvotes = [];
    console.log("added song " + room)
    console.log(selectedOption)
    artist = selectedOption.artist
    duration = selectedOption.duration
    image = selectedOption.image
    isPlaying = selectedOption.is_playing
    progress = selectedOption.progress
    uri = selectedOption.uri
    user = selectedOption.user
    value = selectedOption.value
    redis.hset(
      `${room}:queue:song:${id}`, 
      'id',
      id,
      'artist', 
      artist,
      'duration',
      duration,
      'image',
      image,
      'is_playing',
      isPlaying,
      'progress',
      progress,
      'uri',
      uri,
      'user',
      JSON.stringify(user),
      'value',
      value,
      function (err, result) {
        if (err) {
          console.error(err);
        } else {
          redis.zadd(`${room}:queue`, 0, id, function (err, result2) {
            sendQueue(room);
          })
        }
      }
    );
  });

  socket.on('delete room', function (message) {
    room = message["room"]

    console.log("deleted room " + room);
    multi = redis.multi()
    multi.srem('rooms_set', room)
    multi.del(`${room}:access_token`)
    multi.del(`${room}:refresh_token`)
    multi.del(`${room}:current_song`)
    multi.del(`${room}:owner`)
    multi.exec()
    redis.smembers(`${room}:shared-listen`, function(err, results) {
      for(user_id of results) {
        multi.del(`${room}:connected-user:${user_id}`)
      }

      multi.del(`${room}:shared-listen`)

      redis.zrange(`${room}:queue`, 0, -1, function (error, result) {
        for(id of result) {
          multi.del(`${room}:queue:song:${id}`)
          multi.del(`${room}:queue:song:${id}:upvotes`)
          multi.del(`${room}:queue:song:${id}:downvotes`)
        }

        multi.del(`${room}:queue`)
        multi.exec()
      });
    });

    io.in(room).emit('queue', {currently_playing: {}, queue: []});
  });

  socket.on('pause', function (message) {
    room = message["room"]
    redis.get(`${room}:access_token`, function(err, result) {
      if(result) {
        const req = {
          url: 'https://api.spotify.com/v1/me/player/pause',
          headers: {
            'Authorization': 'Bearer ' + result,
          },
          json: true
        }
        request.put(req, function(error, response, body) {
          if(error || response.statusCode != 204) {
            console.log("pause " + error, + " " + response.statusCode);
            socket.emit('play error', "error")
          }
        });
      }
    });
  });

  socket.on('play', function (message) {
    room = message["room"]
    redis.get(`${room}:access_token`, function(err, result) {
      if(result) {
        const req = {
          url: 'https://api.spotify.com/v1/me/player/play',
          headers: {
            'Authorization': 'Bearer ' + result,
          },
          json: true
        }
        request.put(req, function(error, response, body) {
          if(error || response.statusCode != 204) {
            console.log("play " + error + " " + response.statusCode);
            socket.emit('play error', "error")
          }
        });
      }
    });
  });

  socket.on('next', function (message) {
    room = message["room"]
    redis.set(`${room}:next`, true);
  })

  socket.on('disconnecting', function () {
    var rooms = Object.keys(socket.rooms);
    rooms.forEach(function(room) {
      try {
        if(socket_to_user[room] && socket_to_user[room][socket.id]) {
          delete socket_to_user[room][socket.id]
        }
      } catch (err) {
        console.log(err);
      }
      io.in(room).emit('users', socket_to_user[room]);
    });
  })

  socket.on('disconnect', function () {
    console.log('user disconnected');
  });

  socket.on('connected to room?', function(message) {
    room = message.room
    key = message.access_key
    user_id = message.user_id

    redis.sismember(`${room}:shared-listen`, user_id, function(err, result) {
      if(result) {
        socket.emit('connected in room', true)
      } else {
        socket.emit('connected in room', false)
      }
    }) 
  });

  socket.on('connect to room', function(message) {
    room = message.room
    user_id = message.user_id
    key = message.access_key
    should_connect = message.should_connect

    if (should_connect) {
      user_keys = { "access_key": message.access_key, "refresh_key": message.refresh_key }
      redis.multi().sadd(`${room}:shared-listen`, user_id).hset(`${room}:connected-user:${user_id}`, user_keys).exec(function(err, result) {
        redis.hgetall(`${room}:current_song`, function(error, current_song) {
          if(current_song) {
            playSongForConnectedUser(room, current_song.uri, user_id, current_song.progress)
          }
        })
      })
    } else {
      redis.multi().srem(`${room}:shared-listen`, user_id).del(`${room}:connected-user:${user_id}`).exec()
    }
  });

  socket.on('update connected room', function(message) {
    room = message.room
    user_id = message.user_id
    new_token = message.new_token

    redis.hset(`${room}:connected-user:${user_id}`, "access_key", new_token)
  })
});

setInterval(() => {
  try {
    redis.smembers("rooms_set", function (err, result) {
      if (err) {
        console.error(err);
      } else {
        for(room of result) {
          sendQueue(room)
        }
      } 
    });
  } catch (err) {
    console.log("error from setInterval " + err)
  }
}, 1500)

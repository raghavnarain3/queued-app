
var io = require('socket.io')(3002, {
  pingTimeout: 60000,
});
const request = require('request');
require('dotenv').config({path: __dirname+'/.env'})
const ULID = require('ulid')
const Redis = require("ioredis");
const redis = new Redis();

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
          song.user = JSON.parse(song.user)
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

function updateSongForEveryone(room, track) {
  redis.smembers(`${room}:shared-listen`, function(err, results) {
    for(token of results) {
      const new_song_req = {
        url: 'https://api.spotify.com/v1/me/player/play',
        headers: {
          'Authorization': 'Bearer ' + token,
        },
        json: {
          "uris": [track]
        },
      }
      console.log("PLAYING TRACK")
      request.put(new_song_req, function(error, response, body) {})
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
        if(error) {
          console.log("error getting user " + response.statusCode + " " + error);
        } else {
          redis.hset(`${room}:owner`, { id: body.id, name: body.display_name });
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
      'isPlaying',
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
    redis.srem('rooms_set', room)
    redis.del(`${room}:access_token`)
    redis.del(`${room}:refresh_token`)
    redis.del(`${room}:current_song`)
    redis.del(`${room}:queue`)
    redis.del(`${room}:owner`)
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
            console.log("pause " + error);
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
            console.log("pause " + error);
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
        delete socket_to_user[room][socket.id]
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

    redis.sismember(`${room}:shared-listen`, key, function(err, result) {
      if(result) {
        socket.emit('connected in room', true)
      } else {
        socket.emit('connected in room', false)
      }
    }) 
  });

  socket.on('connect to room', function(message) {
    room = message.room
    key = message.access_key
    should_connect = message.should_connect

    if (should_connect) {
      redis.sadd(`${room}:shared-listen`, key)
    } else {
      redis.srem(`${room}:shared-listen`, key)
    }
  });
});

setInterval(() => {
  try {
    redis.smembers("rooms_set", function (err, result) {
      if (err) {
        console.error(err);
      } else {
        for(room of result) {
          redis
            .multi()
            .get(`${room}:access_token`)
            .get(`${room}:refresh_token`)
            .hgetall(`${room}:current_song`)
            .zrange(`${room}:queue`, 0, -1)
            .get(`${room}:next`)
            .del(`${room}:next`)
            .exec(function(err, results) {
              access_token = results[0][1]
              refresh_token = results[1][1]
              current_song = results[2][1]
              queue = results[3][1]
              next = results[4][1]

              if(queue.length > 0 || current_song.progress != -1) {
                const req = {
                  url: 'https://api.spotify.com/v1/me/player/currently-playing',
                  headers: {
                    'Authorization': 'Bearer ' + access_token,
                  },
                  json: true
                }

                request.get(req, function(error, response, body) {
                  if (!error && (response.statusCode == 200 || response.statusCode == 204)) {
                    if(body === undefined) {
                      currently_playing_song = null;
                      progress = -1;
                      is_playing = false;
                    } else {
                      currently_playing_song = body.item.uri;
                      progress = body.progress_ms;
                      is_playing = body.is_playing;
                    }
                    is_not_playing = (is_playing === false && progress === 0)
                    current_song.progress = progress
                    current_song.is_playing = is_playing

                    redis.hmset(`${room}:current_song`, 'progress', progress, 'is_playing', is_playing, function(err, r) {
                      sendQueue(room)
                    });

                    if(queue.length > 0 && (is_not_playing || (currently_playing_song != null && currently_playing_song != current_song.uri) || next)) {
                      next_song_id = queue[0]
                      redis
                        .multi()
                        .hgetall(`${room}:queue:song:${next_song_id}`)
                        .zrem(`${room}:queue`, next_song_id)
                        .del(`${room}:queue:song:${next_song_id}`)
                        .del(`${room}:queue:song:${next_song_id}:upvotes`)
                        .del(`${room}:queue:song:${next_song_id}:downvotes`)
                        .exec(function(err, next_song_results) {
                          next_track = next_song_results[0][1]

                          if(next_track.uri) {
                            const new_song_req = {
                              url: 'https://api.spotify.com/v1/me/player/play',
                              headers: {
                                'Authorization': 'Bearer ' + access_token,
                              },
                              json: {
                                "uris": [next_track.uri]
                              },
                            }

                            console.log("HMMMMMMM")
                            updateSongForEveryone(room, next_track.uri);
                            request.put(new_song_req, function(error, response, body) {
                              try {
                                if (!error && response.statusCode === 204) {
                                  redis.hset(`${room}:current_song`, next_track, function(err, r) {
                                    sendQueue(room)
                                  });
                                }
                                console.log(response.statusCode)
                              } catch (err) {
                                console.log("error from play next " + err)
                              }
                            })
                          }
                      })
                    }
                  } else {
                    console.log("SPOTIFY ERROR " + error)
                    var client_id = process.env.ROOM_CLIENT_ID
                    var client_secret = process.env.ROOM_CLIENT_SECRET
                    var authOptions = {
                      url: 'https://accounts.spotify.com/api/token',
                      form: {
                        grant_type: 'refresh_token',
                        refresh_token: refresh_token,

                      },
                      headers: {
                        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
                      },
                      json: true
                    }

                    request.post(authOptions, function(error, response, body) {
                      if (!error && response.statusCode === 200) {
                        redis.set(`${room}:access_token`, body.access_token)
                      }
                    });
                  }
                });
              }
            });
        }
      } 
    });
  } catch (err) {
    console.log("error from setInterval " + err)
  }
}, 1500)

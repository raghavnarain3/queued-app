
var io = require('socket.io')(3002, {
  pingTimeout: 60000,
});
const request = require('request');
require('dotenv').config({path: __dirname+'/.env'})
const ULID = require('ulid')
const Redis = require("ioredis");
const redis = new Redis();

room_to_creds = {}
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

      current_song = results[results.length - 1][1]
      console.log(current_song.user)
      if (current_song.user) {
        current_song.user = JSON.parse(current_song.user)
        current_song.is_playing = current_song.is_playing === "true"
      }
      io.in(room).emit('q', {currently_playing: current_song, queue: queue});
    });
  })
    
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

    room_to_creds[room] = {access_token: access_token, refresh_token: refresh_token}
    if (!(room in room_to_queue)) {
      room_to_queue[room] = {currently_playing: {}, queue: []}
    }

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
          redis.set(`${room}:owner`, JSON.stringify({ id: body.id, name: body.display_name }))
          room_to_queue[room].owner = { id: body.id, name: body.display_name };
          console.log(room_to_queue[room].owner)
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

    if (room in room_to_queue) {
      curr_queue = room_to_queue[room]["queue"]
      room_to_queue[room]["queue"] = curr_queue.filter(function( obj ) {
        return obj.id !== id;
      });
      //io.in(room).emit('queue', room_to_queue[room]);
    }
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


    if (room in room_to_queue) {
      obj = room_to_queue[room]["queue"].find(item => item.id === id);
      if(obj) {

        var upvoteIndex = -1;
        for(var i = 0; i < obj.upvotes.length; i++) {
          if(obj.upvotes[i].id === user.id) {
            upvoteIndex = i;
          }
        }

        var downvoteIndex = -1;
        for(var i = 0; i < obj.downvotes.length; i++) {
          if(obj.downvotes[i].id === user.id) {
            downvoteIndex = i;
          }
        }

        if(count > 0) {
          if (upvoteIndex === -1) {
            obj.upvotes.push(user)
          }
          if (downvoteIndex > -1) {
            obj.downvotes.splice(downvoteIndex, 1);
          }
        } else {
          if (downvoteIndex === -1) {
            obj.downvotes.push(user);
          }
          if (upvoteIndex > -1) {
            obj.upvotes.splice(upvoteIndex, 1);
          }
        }
        room_to_queue[room]["queue"].sort(function (a,b) {
          var vote_for_a = a.upvotes.length - a.downvotes.length
          var vote_for_b = b.upvotes.length - b.downvotes.length
          if (vote_for_a > vote_for_b) return -1;
          if (vote_for_a < vote_for_b) return 1;
          return 0;
        });
        //io.in(room).emit('queue', room_to_queue[room]);
      }
    }
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
    });

    if (room in room_to_queue) {
      io.in(room).emit('queue', room_to_queue[room]);
    } else {
      console.log("room " + room + " doesn't exist")
    }
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

    if (room in room_to_queue) {
      room_to_queue[room]["queue"].push(selectedOption);
      //io.in(room).emit('queue', room_to_queue[room]);
    }
  });

  socket.on('delete room', function (message) {
    room = message["room"]
    delete room_to_queue[room]
    delete room_to_creds[room]
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

    if (room in room_to_queue) {
      queue = room_to_queue[room]["queue"]
      if (queue.length > 0 && room_to_queue[room]["currently_playing"] != undefined) {
        room_to_queue[room]["currently_playing"]["next"] = true
      }
    }
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
                      console.log("BBBBBBBBBBBBBBBBBBBB");
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

                            request.put(new_song_req, function(error, response, body) {
                              try {
                                if (!error && response.statusCode === 204) {
                                  redis.hset(`${room}:current_song`, next_track, function(err, r) {
                                    console.log("ZZZZZZZZZZZZZZZ");
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
                    console.log("SPOTIFY ERROR " + response.statusCode)
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
                console.log(current_song);
                console.log(queue);
              }
            });
        }
      } 
    });
  } catch (err) {
    console.log("error from setInterval " + err)
  }
}, 1500)

// setInterval(() => {
//   try {
//     for (const room in room_to_queue) {
//       if (room_to_queue[room]["queue"] !== undefined && (room_to_queue[room]["queue"].length > 0 || (room_to_queue[room]["currently_playing"] != undefined && room_to_queue[room]["currently_playing"]["progress"] != -1))) {
//         const req = {
//           url: 'https://api.spotify.com/v1/me/player/currently-playing',
//           headers: {
//             'Authorization': 'Bearer ' + room_to_creds[room]["access_token"],
//           },
//           json: true
//         }
//         request.get(req, function(error, response, body) {
//           try {
//             if (!error && (response.statusCode == 200 || response.statusCode == 204)) {
//               if(body === undefined) {
//                 currently_playing_song = null;
//                 progress = -1;
//                 is_playing = false;
//               } else {
//                 currently_playing_song = body["item"]["uri"];
//                 progress = body["progress_ms"];
//                 is_playing = body["is_playing"];
//               }
//               is_not_playing = (is_playing === false && progress === 0)
//               if (room_to_queue[room]["currently_playing"] != undefined) {
//                 room_to_queue[room]["currently_playing"]["progress"] = progress
//                 room_to_queue[room]["currently_playing"]["is_playing"] = is_playing
//               }
//               //io.in(room).emit('queue', room_to_queue[room])
//               if (room_to_queue[room]["queue"].length > 0 && (is_not_playing || (room_to_queue[room]["currently_playing"] && (currently_playing_song != null && currently_playing_song !== room_to_queue[room]["currently_playing"]["uri"])) || (room_to_queue[room]["currently_playing"] && room_to_queue[room]["currently_playing"]["next"]))) {
//                 next_track = room_to_queue[room]["queue"].shift()
//                 if(next_track) {
//                   const new_song_req = {
//                     url: 'https://api.spotify.com/v1/me/player/play',
//                     headers: {
//                       'Authorization': 'Bearer ' + room_to_creds[room]["access_token"],
//                     },
//                     json: {
//                       "uris": [next_track["uri"]]
//                     },
//                   }

//                   request.put(new_song_req, function(error, response, body) {
//                     try {
//                       if (!error && response.statusCode === 204) {
//                         if (room in room_to_queue) {
//                           room_to_queue[room]["currently_playing"] = next_track
//                           //io.in(room).emit('queue', room_to_queue[room]);
//                         }
//                       }
//                       console.log(response.statusCode)
//                     } catch (err) {
//                       console.log("error from play next " + err)
//                     }
//                   })
//                 }
//               }
//             } else {
//               console.log(response.statusCode)
//               var client_id = process.env.ROOM_CLIENT_ID
//               var client_secret = process.env.ROOM_CLIENT_SECRET
//               var authOptions = {
//                 url: 'https://accounts.spotify.com/api/token',
//                 form: {
//                   grant_type: 'refresh_token',
//                   refresh_token: room_to_creds[room].refresh_token,

//                 },
//                 headers: {
//                   'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
//                 },
//                 json: true
//               }

//               request.post(authOptions, function(error, response, body) {
//                 if (!error && response.statusCode === 200) {
//                   console.log(body.access_token)
//                   room_to_creds[room].access_token = body.access_token
//                 }
//               })
//             }
//           } catch (err) {
//             console.log("error from current song " + err)
//           }
//         })
//       } else {
//         console.log("not using creds for room " + room)
//         console.log("currently playing from queue" + room_to_queue[room]["currently_playing"])
//         console.log("currently playing on spotify " + currently_playing_song)

//       }
//     } 
//   } catch (err) {
//     console.log("error from setInterval " + err)
//   };
// }, 1500)

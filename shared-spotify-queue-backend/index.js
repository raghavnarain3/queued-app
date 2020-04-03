
var io = require('socket.io')(80, {
  pingTimeout: 60000,
});
const request = require('request');

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
      room_to_queue[room] = {currently_playing: "", queue: [], current_song: ""}
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
    io.in(room).emit('queue', {currently_playing: "", queue: [], current_song: ""});
  });

  socket.on('disconnect', function () {
    console.log('user disconnected');
  });
});

setInterval(() => {
  try {
    for (const room in room_to_queue) {
      queue = room_to_queue[room]["queue"]

      if (queue !== undefined && queue.length > 0) {
        const req = {
          url: 'https://api.spotify.com/v1/me/player/currently-playing',
          headers: {
            'Authorization': 'Bearer ' + room_to_creds[room]["access_token"],
          },
          json: true
        }

        request.get(req, function(error, response, body) {
          try {
            if (!error && response.statusCode === 200) {
              currently_playing_song = body["item"]["uri"];
              is_not_playing = (body["is_playing"] === false && body["progress_ms"] === 0)
              if (currently_playing_song !== room_to_queue[room]["currently_playing"] || is_not_playing) {
                next_track = room_to_queue[room]["queue"].shift()
                console.log(next_track)
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
                          room_to_queue[room]["currently_playing"] = next_track["uri"]
                          room_to_queue[room]["current_song"] = next_track["label"]
                          console.log(room_to_queue[room])
                          io.in(room).emit('queue', room_to_queue[room]);
                        }
                      }
                      console.log(response.statusCode)
                    } catch (err) {
                      console.log(err)
                    }
                  })
                }
              }
            }
          } catch (err) {
            console.log(err)
          }
        })
      }
    }
  } catch (err) {
    console.log(err)
  };
}, 1000)

package main

import (
  "bytes"
  "strings"
  "os"
  "fmt"
  "log"
  "time"
  "net/http"
  "net/url"
  "io/ioutil"
  "encoding/json"
  b64 "encoding/base64"

  "github.com/gomodule/redigo/redis"
  "github.com/joho/godotenv"
)

var pool *redis.Pool

type Song struct {
  Id  string        `redis:"id"`
  Artist string     `redis:"artist"`
  Duration  string  `redis:"duration"`
  Image  string     `redis:"image"`
  IsPlaying  string `redis:"is_playing"`
  Progress string   `redis:"progress"`
  Uri  string       `redis:"uri"`
  User  string      `redis:"user"`
  Value string      `redis:"value"`
}

func goDotEnvVariable(key string) string {

  // load .env file
  err := godotenv.Load(".env")

  if err != nil {
    log.Fatalf("Error loading .env file")
  }

  return os.Getenv(key)
}


func main() {
  pool = &redis.Pool{
    MaxIdle:     10,
    IdleTimeout: 240 * time.Second,
    Dial: func() (redis.Conn, error) {
      return redis.Dial("tcp", "localhost:6379")
    },
  }

  for {
    updateRooms()
    time.Sleep(1 * time.Second)
  }
}

func updateRooms() {
  conn := pool.Get()

  defer conn.Close()

  rooms, err := redis.Strings(conn.Do("SMEMBERS", "rooms_set"))
  if err == redis.ErrNil {
    log.Println("trying again")
    return
  } else if err != nil {
    log.Println(err)
    return
  }

  for _, room := range rooms {
    go updateRoom(room)
  }
}

type PlayJson struct {
  Uris []string `json:"uris"`
}

type PlaylistJson struct {
  ContextUri string `json:"context_uri"`
}

func spotifyPlayRequest(accessToken string, songUri string) (int){
  url := "https://api.spotify.com/v1/me/player/play"
  playJson := PlayJson{ Uris: []string{songUri} }
  log.Println(playJson)
  reqJson, _ := json.Marshal(playJson)
  var v interface{}
  json.Unmarshal(reqJson, &v)
  log.Println("play")
  log.Println(v)

  req, err := http.NewRequest("PUT", url, bytes.NewBuffer(reqJson))
  if err != nil {
    log.Println(err)
  }
  req.Header.Set("Authorization", "Bearer " + accessToken)
  req.Header.Set("Content-Type", "application/json")
  resp, err := http.DefaultClient.Do(req)
  if err != nil {
    log.Println(err)
    return 500
  }
  defer resp.Body.Close()
  
  return resp.StatusCode
}

func spotifyTurnOnShuffle(accessToken string) (int) {
  url := "https://api.spotify.com/v1/me/player/shuffle?state=true"

  req, err := http.NewRequest("PUT", url, nil)
  if err != nil {
    log.Println(err)
  }
  req.Header.Set("Authorization", "Bearer " + accessToken)
  req.Header.Set("Content-Type", "application/json")
  resp, err := http.DefaultClient.Do(req)
  if err != nil {
    log.Println(err)
    return 500
  }
  defer resp.Body.Close()
  
  return resp.StatusCode
}

func spotifyTurnOffRepeat(accessToken string) (int) {
  url := "https://api.spotify.com/v1/me/player/repeat?state=off"

  req, err := http.NewRequest("PUT", url, nil)
  if err != nil {
    log.Println(err)
  }
  req.Header.Set("Authorization", "Bearer " + accessToken)
  req.Header.Set("Content-Type", "application/json")
  resp, err := http.DefaultClient.Do(req)
  if err != nil {
    log.Println(err)
    return 500
  }
  defer resp.Body.Close()
  
  return resp.StatusCode
}


func spotifyPlayRequestPlaylist(accessToken string, playlistUri string) (int){
  url := "https://api.spotify.com/v1/me/player/play"
  playlistJson := PlaylistJson{ ContextUri: playlistUri }
  reqJson, _ := json.Marshal(playlistJson)

  req, err := http.NewRequest("PUT", url, bytes.NewBuffer(reqJson))
  if err != nil {
    log.Println(err)
  }
  req.Header.Set("Authorization", "Bearer " + accessToken)
  req.Header.Set("Content-Type", "application/json")
  resp, err := http.DefaultClient.Do(req)
  if err != nil {
    log.Println(err)
    return 500
  }
  defer resp.Body.Close()
  
  return resp.StatusCode
}

func playNextTrack(access_token string, refresh_token string, room string, nextUri string, redisConnection redis.Conn) {
  var statusCode = spotifyPlayRequest(access_token, nextUri)
  fmt.Println("playing song for main user in room " + room)
  fmt.Println(statusCode)

  if(statusCode == 404) {
    log.Println("Cant find room for main user " + room)
    return
  }

  if(statusCode == 429) {
    log.Println("Rate limit " + room)
    return
  }

  if(statusCode == 401) {
    var token = refreshAccessToken(room, access_token, refresh_token, redisConnection)
    if(token != "") {
      playNextTrack(token, refresh_token, room, nextUri, redisConnection)
    }
  }
  playingIncorrectSong := true
  log.Println("CHECKING SONG")
  for playingIncorrectSong {
    data := getCurrentlyPlaying(room, access_token)
    if data != nil {
      log.Println("checking incorrect song")
      if (data["item"] != nil) {
        var uri = data["item"].(map[string]interface{})["uri"];
        playingIncorrectSong = uri != nextUri
      }
      if playingIncorrectSong {
        log.Println("incorrect song")
        time.Sleep(1 * time.Second)
      }
    } else {
      log.Println("DONE")
      playingIncorrectSong = false
    }
  }
}

func playPlaylist(access_token string, refresh_token string, room string, playlistUri string, redisConnection redis.Conn) {
  var shuffleStatusCode = spotifyTurnOnShuffle(access_token)
  var statusCode = spotifyPlayRequestPlaylist(access_token, playlistUri)
  log.Println("shuffle status code " + room)
  log.Println(shuffleStatusCode)
  log.Println("playing playlist for main user " + room)
  log.Println(statusCode)

  if(statusCode == 404) {
    log.Println("Cant find room for main user " + room)
    return
  }

  if(statusCode == 429) {
    log.Println("Rate limit " + room)
    return
  }

  if(statusCode == 401) {
    var token = refreshAccessToken(room, access_token, refresh_token, redisConnection)
    if(token != "") {
      playPlaylist(token, refresh_token, room, playlistUri, redisConnection)
    }
  }
}

type ConnectedUser struct {
  AccessKey string `redis:"access_key"`
  RefreshKey string `redis:"refresh_key"`
}

func playSongForConnectedUsers(room string, songUri string, redisConnection redis.Conn) {
  users, err := redis.Strings(redisConnection.Do("SMEMBERS", room+":shared-listen"))
    if err == redis.ErrNil {
    log.Println("trying again")
    return
  } else if err != nil {
    log.Println(err)
    return
  }

  for _, user := range users {
    playSongForConnectedUser(room, user, songUri, redisConnection)
  }
}

func playSongForConnectedUser(room string, userId string, songUri string, redisConnection redis.Conn) {
  res, err := redis.Values(redisConnection.Do("HGETALL", room+":connected-user:"+userId))
  if err != nil {
    log.Println(err)
  }
  var connectedUser ConnectedUser
  err = redis.ScanStruct(res, &connectedUser)
  if err != nil {
    log.Println(err)
    return
  }

  var statusCode = spotifyPlayRequest(connectedUser.AccessKey, songUri)
  fmt.Println("playing song for " + userId)
  fmt.Println(statusCode)
  
  if(statusCode == 404) {
    log.Println("Cant find room for " + userId)
    return
  }

  if(statusCode == 429) {
    log.Println("Rate limit " + userId)
    time.Sleep(1 * time.Second)
  }

  if(statusCode == 401) {
    var clientId = goDotEnvVariable("CLIENT_ID")
    var clientSecret = goDotEnvVariable("CLIENT_SECRET")

    var newAccessKey = spotifyRefreshRequest(clientId, clientSecret, connectedUser.RefreshKey)
    if(newAccessKey != "") {
      _, err = redisConnection.Do("HSET", room+":connected-user:"+userId, "access_key", newAccessKey)
      if err != nil {
        log.Println(err)
      }

      playSongForConnectedUser(room, userId, songUri, redisConnection)
    }
  }
}

func spotifyRefreshRequest(clientId string, clientSecret string, refreshToken string) (string){
  token_url := "https://accounts.spotify.com/api/token"
  formData := url.Values{}
  formData.Set("grant_type", "refresh_token")
  formData.Set("refresh_token", refreshToken)

  headerValue := clientId + ":" + clientSecret
  encodedHeaderValue := b64.StdEncoding.EncodeToString([]byte(headerValue))

  req, err := http.NewRequest("POST", token_url, strings.NewReader(formData.Encode()))
  if err != nil {
    log.Println(err)
  }
  req.Header.Set("Authorization", "Basic " + encodedHeaderValue)
  req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
  resp, err := http.DefaultClient.Do(req)
  if err != nil {
    log.Println(err)
  }
  
  defer resp.Body.Close()

  if(resp.StatusCode == 200) {
    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
      log.Fatal(err)
      return ""
    }
    if(len(body) != 0) {
      var v interface{}
      json.Unmarshal(body, &v)
      if v == nil {
        log.Println("bug")
        return ""
      }
      data := v.(map[string]interface{})

      if accessToken, ok := data["access_token"].(string); ok {
        return accessToken
      }
    }
  }

  return ""
}

func refreshAccessToken(room string, accessToken string, refreshToken string, redisConnection redis.Conn) (string){
  var clientId = goDotEnvVariable("ROOM_CLIENT_ID")
  var clientSecret = goDotEnvVariable("ROOM_CLIENT_SECRET")

  var newAccessToken = spotifyRefreshRequest(clientId, clientSecret, refreshToken)

  if(newAccessToken != "") {
    _, err := redisConnection.Do("SET", room+":access_token", newAccessToken)
    if err != nil {
      log.Println(err)
    }
  }

  return newAccessToken
}

func getCurrentlyPlaying(room string, accessToken string) (map[string]interface{}) {
  url := "https://api.spotify.com/v1/me/player/currently-playing"
  req, err := http.NewRequest("GET", url, nil)
  if err != nil {
    log.Println(err)
    return nil
  }
  req.Header.Set("Authorization", "Bearer " + accessToken)
  resp, err := http.DefaultClient.Do(req)
  if err != nil {
    log.Println(err)
    return nil
  }
  defer resp.Body.Close()
  if(resp.StatusCode == 200 || resp.StatusCode == 204) {
    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
      log.Fatal(err)
    }
    if(len(body) != 0) {
      var v interface{}
      json.Unmarshal(body, &v)
      if v == nil {
        log.Println("can't get currently playing for")
        log.Println(room)
        return nil
      }
      data := v.(map[string]interface{})
      if data == nil {
        log.Println("can't get (data) currently playing for")
        log.Println(room)
        return nil
      }

      return data
    }
  }
  return nil
}

func updateRoom(room string) {
  defer func() {
    if err := recover(); err != nil {
      fmt.Println("FAILURE")
      log.Println(err)
    }
  }()

  conn := pool.Get()

  defer conn.Close()

  _, lock_err := redis.String(conn.Do("SET", room+":lock", true, "EX", 10, "NX"))
  if lock_err == redis.ErrNil {
    log.Println(room+" locked")
    return
  } else if lock_err != nil {
    log.Println(lock_err)
    redis.String(conn.Do("DEL", room+":lock"))
    return
  }

  err := conn.Send("MULTI")
  if err != nil {
    log.Println(err)
    redis.String(conn.Do("DEL", room+":lock"))
    return
  }
  err = conn.Send("GET", room+":access_token")
  if err != nil {
    log.Println(err)
  }
  err = conn.Send("GET", room+":refresh_token")
  if err != nil {
    log.Println(err)
  }
  err = conn.Send("HGETALL", room+":current_song")
  if err != nil {
    log.Println(err)
  }
  err = conn.Send("ZRANGE", room+":queue", 0, -1)
  if err != nil {
    log.Println(err)
  }
  err = conn.Send("GET", room+":next")
  if err != nil {
    log.Println(err)
  }
  err = conn.Send("GET", room+":backup_playlist_uri")
  if err != nil {
    log.Println(err)
  }
  err = conn.Send("GET", room+":playing_playlist")
  if err != nil {
    log.Println(err)
  }
  err = conn.Send("GET", room+":toggled_loop")
  if err != nil {
    log.Println(err)
  }

  err = conn.Send("DEL", room+":next")
  if err != nil {
    log.Println(err)
  }

  replies, err := redis.Values(conn.Do("EXEC"))
  if err == redis.ErrNil {
    log.Println("trying again")
    redis.String(conn.Do("DEL", room+":lock"))
    return
  } else if err != nil {
    log.Println(err)
    redis.String(conn.Do("DEL", room+":lock"))
    return
  }

  access_token, err := redis.String(replies[0], err)
  if err != nil {
    log.Println(err)
  }

  refresh_token, err := redis.String(replies[1], err)
  if err != nil {
    log.Println(err)
  }

  var currentSong Song
  err = redis.ScanStruct(replies[2].([]interface{}), &currentSong)
  if err != nil {
    log.Println(err)
  }

  queue, err := redis.Strings(replies[3], err)
  if err != nil {
    log.Println(err)
  }

  next, next_err := redis.String(replies[4], err)
  if next_err == redis.ErrNil {
  } else if next_err == redis.ErrNil {
    log.Println(next_err)
  }

  backup_playlist_uri, backup_err := redis.String(replies[5], err)
  if backup_err == redis.ErrNil {
  } else if backup_err == redis.ErrNil {
    log.Println(backup_err)
  }

  playing_playlist, playlist_err := redis.String(replies[6], err)
  if playlist_err == redis.ErrNil {
  } else if playlist_err == redis.ErrNil {
    log.Println(playlist_err)
  }

  _, loop_error := redis.String(replies[7], err)
  if loop_error == redis.ErrNil {
  } else if loop_error == redis.ErrNil {
    log.Println(loop_error)
  }


  if(len(queue) == 0 && backup_err != redis.ErrNil && playing_playlist != "true" && (currentSong.Progress == "0" || currentSong.Progress == "-1")) {
    playPlaylist(access_token, refresh_token, room, backup_playlist_uri, conn)
    _, err := conn.Do("SET", room+":playing_playlist", "true")
    if err != nil {
      log.Println(err)
    }
    playing_playlist = "true"
  }

  if(len(queue) > 0 || currentSong.Progress != "-1") {
    data := getCurrentlyPlaying(room, access_token)
    if data != nil && data["item"] != nil {
      if(loop_error == redis.ErrNil) {
        spotifyTurnOffRepeat(access_token)
        _, err := conn.Do("SET", room+":toggled_loop", "true")
        if err != nil {
          log.Println(err)
        }
      }

      var uri = data["item"].(map[string]interface{})["uri"];
      var name = data["item"].(map[string]interface{})["name"]
      var artist = data["item"].(map[string]interface{})["artists"].([]interface{})[0].(map[string]interface{})["name"]
      var image = data["item"].(map[string]interface{})["album"].(map[string]interface{})["images"].([]interface{})[0].(map[string]interface{})["url"]
      var duration = data["item"].(map[string]interface{})["duration_ms"]

      var progress = data["progress_ms"]
      var playing = data["is_playing"]
      var is_playing string
      if(playing == true) {
        is_playing = "true"
      } else {
        is_playing = "false"
      }
      var is_not_playing = (is_playing == "false" && progress == 0.0 && uri == currentSong.Uri)

      _, err := conn.Do("HSET", room+":current_song", "progress", progress, "is_playing", is_playing)
      if err != nil {
        log.Println(err)
      }

      if(len(queue) == 0 && uri != currentSong.Uri && playing_playlist == "true") {
        _, err := conn.Do("HSET", room+":current_song", "value", name, "artist", artist, "uri", uri, "image", image, "duration", duration)
        if err != nil {
          log.Println(err)
        }
        playSongForConnectedUsers(room, uri.(string), conn)
      }

      if(len(queue) > 0 && (is_not_playing || (uri != currentSong.Uri) || next == "true" || playing_playlist == "true" )) {
        var nextSongId = queue[0]

        err := conn.Send("MULTI")
        if err != nil {
          log.Println(err)
          redis.String(conn.Do("DEL", room+":lock"))
          return
        }
        err = conn.Send("HGETALL", room+":queue:song:"+nextSongId)
        if err != nil {
          log.Println(err)
        }
        err = conn.Send("ZREM", room+":queue", nextSongId)
        if err != nil {
          log.Println(err)
        }
        err = conn.Send("DEL", room+":queue:song:"+nextSongId)
        if err != nil {
          log.Println(err)
        }
        err = conn.Send("DEL", room+":queue:song:"+nextSongId+":upvotes")
        if err != nil {
          log.Println(err)
        }
        err = conn.Send("DEL", room+":queue:song:"+nextSongId+":downvotes")
        if err != nil {
          log.Println(err)
        }
        responses, err := redis.Values(conn.Do("EXEC"))
        if err == redis.ErrNil {
          log.Println("trying again")
        } else if err != nil {
          log.Println(err)
        }

        var nextSong Song
        err = redis.ScanStruct(responses[0].([]interface{}), &nextSong)
        if err != nil {
          log.Println(err)
        }

        log.Println("playing song")
        fmt.Println(nextSong.Uri)
        fmt.Println(nextSong.Value)
        log.Println("playing next track")
        playNextTrack(access_token, refresh_token, room, nextSong.Uri, conn)
        log.Println("finished next track")
        playSongForConnectedUsers(room, nextSong.Uri, conn)
        log.Println("finished connected")
        _, err = conn.Do(
          "HSET", room+":current_song", 
          "id", nextSong.Id,
          "artist", nextSong.Artist,
          "duration", nextSong.Duration,
          "image", nextSong.Image,
          "is_playing", nextSong.IsPlaying,
          "progress", 1,
          "uri", nextSong.Uri,
          "user", nextSong.User,
          "value", nextSong.Value,
        )
        if err != nil {
          log.Println(err)
        }

        _, err = conn.Do("DEL", room+":playing_playlist")
        if err != nil {
          log.Println(err)
        }
      }
    } else {
      refreshAccessToken(room, access_token, refresh_token, conn)
    }
  }
  redis.String(conn.Do("DEL", room+":lock"))
}
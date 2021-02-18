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

func spotifyPlayRequest(accessToken string, songUri string) (int){
  url := "https://api.spotify.com/v1/me/player/play"
  playJson := PlayJson{ Uris: []string{songUri} }
  reqJson, _ := json.Marshal(playJson)

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

func playNextTrack(access_token string, refresh_token string, room string, nextTrack Song, redisConnection redis.Conn) {
  var statusCode = spotifyPlayRequest(access_token, nextTrack.Uri)
  fmt.Println("playing song for main user")
  fmt.Println(statusCode)

  if(statusCode == 404) {
    log.Println("Cant find room for main user " + room)
    return
  }

  if(statusCode == 429) {
    log.Println("Rate limit " + room)
    return
  }

  if(statusCode != 200 && statusCode != 204) {
    var token = refreshAccessToken(room, access_token, refresh_token, redisConnection)
    if(token != "") {
      playNextTrack(token, refresh_token, room, nextTrack, redisConnection)
    }
  }
  playingIncorrectSong := true
  log.Println("CHECKING SONG")
  for playingIncorrectSong {
    data := getCurrentlyPlaying(room, access_token)
    if data != nil {
      log.Println("data")
      log.Println(data)
      var uri = data["item"].(map[string]interface{})["uri"];
      playingIncorrectSong = uri != nextTrack.Uri
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

  if(statusCode != 200 && statusCode != 204) {
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
  log.Println("0")
  if(resp.StatusCode == 200 || resp.StatusCode == 204) {
    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
      log.Fatal(err)
    }
    if(len(body) != 0) {
      var v interface{}
      json.Unmarshal(body, &v)
      log.Println("1")
      if v == nil {
        log.Println("can't get currently playing for")
        log.Println(room)
        return nil
      }
      log.Println("2")
      data := v.(map[string]interface{})
      if data == nil {
        log.Println("can't get (data) currently playing for")
        log.Println(room)
        return nil
      }
      log.Println("3")

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

  next, err := redis.String(replies[4], err)
  if err == redis.ErrNil {
  } else if err == redis.ErrNil {
    log.Println(err)
  }

  if(len(queue) > 0 || currentSong.Progress != "-1") {
    data := getCurrentlyPlaying(room, access_token)
    if data != nil {
      var uri = data["item"].(map[string]interface{})["uri"];
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

      if(len(queue) > 0 && (is_not_playing || (uri != currentSong.Uri) || next == "true")) {
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
        playNextTrack(access_token, refresh_token, room, nextSong, conn)
        log.Println("finished enxt track")
        playSongForConnectedUsers(room, nextSong.Uri, conn)
        log.Println("finished connected")
        _, err = conn.Do(
          "HSET", room+":current_song", 
          "id", nextSong.Id,
          "artist", nextSong.Artist,
          "duration", nextSong.Duration,
          "image", nextSong.Image,
          "is_playing", nextSong.IsPlaying,
          "progress", nextSong.Progress,
          "uri", nextSong.Uri,
          "user", nextSong.User,
          "value", nextSong.Value,
        )
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
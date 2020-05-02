import React from 'react'
import Select from 'react-select'
import Button from 'react-bootstrap/Button';
import ProgressBar from 'react-bootstrap/ProgressBar'
import AsyncSelect from 'react-select/async'
import socketIOClient from "socket.io-client";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlay, faPause, faForward } from '@fortawesome/free-solid-svg-icons'

class Search extends React.Component {
  state = {
    selectedOptions: [],
    currentSong: "",
    endpoint: process.env.REACT_APP_SOCKET,
    socket: null,
  }

  componentWillMount() {
    const { endpoint } = this.state;
    const socket = socketIOClient(endpoint);
    const { room } = this.props.match.params

    socket.emit('join room', {room: room, user: "roscoe"})
    socket.on('joined', data => {
      console.log(data + " joined!")
    });
    socket.on('queue', data => {
      console.log(data)
      this.setState({ selectedOptions: data["queue"], currentSong: data["currently_playing"] });
    });
    this.setState({ socket: socket });
  }

  loadOptions = (inputValue) => {
    const { access_key } = this.props.match.params
    console.log(access_key)
    return fetch('https://api.spotify.com/v1/search' + '?q=' + inputValue + '&type=track', {
      headers: { 'Authorization': 'Bearer ' + access_key },
    })
      .then(response => response.json())
      .then(json => {
        console.log(json["tracks"]["items"])
        return json["tracks"]["items"].map((item) => (
          { value: item["name"], label: item["name"], artist: item["artists"][0]["name"], uri: item["uri"], image: item["album"]["images"][0]["url"], duration: item["duration_ms"], progress: 0, is_playing: true }
        ))
      })
  }

  onChange = (selectedOption) => {
    const { room } = this.props.match.params
    const { socket } = this.state;
    var message = {room: room, selectedOption: selectedOption}
    socket.emit('add', message);
  }

  deleteRoom = () => {
    const { room } = this.props.match.params
    const { socket } = this.state;
    var message = {room: room}
    socket.emit('delete room', message)
  }

  getIcon = () => {
    return faPlay;
  }

  playOrPause = () => {
    const { room } = this.props.match.params
    const { socket } = this.state;
    const { currentSong } = this.state
    
    var message = {room: room}

    if (currentSong["is_playing"] === false) {
      socket.emit('play', message)
    } else {
      socket.emit('pause', message)
    }
  }

  nextSong = () => {
    const { room } = this.props.match.params
    const { socket } = this.state;

    var message = {room: room}

    socket.emit('next', message)
  }

  render() {
    const { room } = this.props.match.params
    const { selectedOptions, currentSong } = this.state
  	return (
      <div className={"flex-container"}>
        <div>Welcome to room: {room}</div>
        <div className={"now-playing"}>
          <div className={"flex-item"}>
            <img className={"album"} src={currentSong["image"]}></img>
            <div className={"song-info"}>
              <div className={"player-details"}>
                <div>
                  <div>{currentSong["value"]}</div>
                  <div>{currentSong["artist"]}</div>
                </div>
                <div className={"controls"}>
                  <span className={"play"} onClick={this.playOrPause}>
                    <FontAwesomeIcon icon={currentSong["is_playing"] ? faPause : faPlay} />
                  </span>
                  <span className={"next"} onClick={this.nextSong}>
                    <FontAwesomeIcon icon={faForward} />
                  </span>
                </div>
              </div>

              <div className={"progress-div"}>
                <ProgressBar variant="info" now={(currentSong["progress"]/currentSong["duration"])*100} />
              </div>
            </div>
          </div>
        </div>
        <div>Search for a song...</div>
		    <AsyncSelect className="select"
                loadOptions={this.loadOptions}
                onChange={this.onChange}
        />
        <div className={"flex-scrollable"}>
          {selectedOptions.map((value) => {
            return <div className={"flex-item"}><img className={"album"} src={value["image"]}></img><div><div>{value["value"]}</div><div>{value["artist"]}</div></div></div>
          })}
        </div>
        <Button variant="danger" className="flex-button" onClick={this.deleteRoom}>Delete Room</Button>
      </div>
    )
  }
}

export default Search

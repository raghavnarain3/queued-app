import React from 'react'
import Select from 'react-select'
import Button from 'react-bootstrap/Button';
import Toast from 'react-bootstrap/Toast'
import Nav from 'react-bootstrap/Nav'
import Accordion from 'react-bootstrap/Accordion'
import FormControl from 'react-bootstrap/FormControl'
import ProgressBar from 'react-bootstrap/ProgressBar'
import AsyncSelect from 'react-select/async'
import socketIOClient from "socket.io-client";
import Fade from 'react-bootstrap/Fade'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlay, faPause, faForward, faPlus, faAngleDown, faTimes } from '@fortawesome/free-solid-svg-icons'
import { v4 as uuidv4 } from 'uuid';

class Search extends React.Component {
  state = {
    selectedOptions: [],
    tabName: "search",
    currentSong: {},
    endpoint: process.env.REACT_APP_SOCKET,
    socket: null,
    query: "",
    searchResults: [],
    playlists: [],
    show: false,
    queuedSong: "",
  }

  constructor() {
    super()
    this.textInput = React.createRef();
  }


  handleChange() {
    this.setState({ query: this.textInput.current.value }, () => {
      this.search();
    })
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
      this.setState({ selectedOptions: data["queue"], currentSong: data["currently_playing"] || {} });
    });
    this.setState({ socket: socket });
  }

  search = () => {
    const { access_key } = this.props.match.params
    const { query } = this.state

    let results = fetch('https://api.spotify.com/v1/search' + '?q=' + query + '&type=track', {
      headers: { 'Authorization': 'Bearer ' + access_key },
    })
      .then(response => response.json())
      .then(json => {
        if (json["tracks"]) {
          let results = json["tracks"]["items"].map((item) => (
            { id: uuidv4(), value: item["name"], artist: item["artists"][0]["name"], uri: item["uri"], image: item["album"]["images"][0]["url"], duration: item["duration_ms"], progress: 0, is_playing: true }
          ))
          this.setState({ searchResults: results })
        } else {
          this.setState({ searchResults: [] })
        }
      })
  }

  remove = (id) => {
    const { room } = this.props.match.params
    const { socket } = this.state;
    var message = {room: room, id: id}
    socket.emit('delete song', message);
  }

  getPlaylists = () => {
    const { access_key } = this.props.match.params

    let results = fetch('https://api.spotify.com/v1/me/playlists', {
      headers: { 'Authorization': 'Bearer ' + access_key },
    })
      .then(response => response.json())
      .then(json => {
        if (json["items"]) {
          let results = json["items"].map((item) => (
            { id: uuidv4(), value: item["name"], artist: item["owner"]["display_name"], uri: item["tracks"]["href"], image: item["images"][0]["url"] }
          ))
          this.setState({ playlists: results })
        } else {
          this.setState({ playlists: [] })
        }
      })
  }

  getPlaylistTracks = (uri, index) => {
    const { access_key } = this.props.match.params
    const { query, playlists } = this.state

    let results = fetch(uri, {
      headers: { 'Authorization': 'Bearer ' + access_key },
    })
      .then(response => response.json())
      .then(json => {
        if (json["items"]) {
          let results = json["items"].filter((item) => {
            if (item["track"]) {
              return true
            } else {
              return false
            }
          }).map((item) => (
            { id: uuidv4(), value: item["track"]["name"], artist: item["track"]["artists"][0]["name"], uri: item["track"]["uri"], image: item["track"]["album"]["images"][0]["url"], duration: item["track"]["duration_ms"], progress: 0, is_playing: true }
          ))
          playlists[index]["results"] = results
          this.setState({ playlists: playlists })
        }
      })
  }

  handleKeyPress = (event) => {
    if (event.key === "Enter") {
      this.textInput.current.blur()
    }
  }

  onChange = (selectedOption) => {
    const { room } = this.props.match.params
    const { socket } = this.state;
    var message = {room: room, selectedOption: selectedOption}
    socket.emit('add', message);
    this.setState({ queuedSong: selectedOption["value"], show: true })
  }

  deleteRoom = () => {
    const { room } = this.props.match.params
    const { socket } = this.state;
    var message = {room: room}
    socket.emit('delete room', message)
    this.props.history.push('/')

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

  showNowPlaying = () => {
    const { currentSong } = this.state
    if ("image" in currentSong) {
      return true
    } else {
      return false
    }
  }

  switchViews = (selectedKey) => {
    if (selectedKey == "playlists") {
      this.getPlaylists()
      this.setState({ tabName: "playlists" });
    } else {
      this.setState({ tabName: selectedKey });
    }
  }

  stopShow = () => {
    this.setState({ show: false })
  }

  render() {
    const { room } = this.props.match.params
    const { selectedOptions, currentSong, tabName, query, searchResults, show, queuedSong, playlists } = this.state
  	return (
      <div className={"flex-container"}>
        <Toast onClose={this.stopShow} show={show} delay={750} autohide>
          <Toast.Header>
            <div>Added <strong>{queuedSong}</strong> to the queue!</div>
          </Toast.Header>
        </Toast>
        <div>Room: <b>{room}</b></div>
        {!this.showNowPlaying() && (
          <div className={"now-playing"}>
            <div className={"flex-item"}>
              <img className={"album"}></img>
              <div className={"song-info"}>
                <div className={"player-details"}>
                  <div>
                    <div>-</div>
                    <div>-</div>
                  </div>
                  <div className={"controls"}>
                    <span className={"play"} onClick={this.playOrPause}>
                      <FontAwesomeIcon icon={currentSong["is_playing"] ? faPause : faPlay} />
                    </span>
                    <span className={"control-fa"} onClick={this.nextSong}>
                      <FontAwesomeIcon icon={faForward} />
                    </span>
                  </div>
                </div>

                <div className={"progress-div"}>
                  <ProgressBar />
                </div>
              </div>
            </div>
          </div>
        )}
        {this.showNowPlaying() && (
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
                    <span className={"control-fa"} onClick={this.nextSong}>
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
        )}
        <Nav justify variant="pills" defaultActiveKey="search" onSelect={(selectedKey) => this.switchViews(selectedKey)}>
          <Nav.Item>
            <Nav.Link eventKey="search">Search</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="playlists">Playlists</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="queue">Queue</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="settings">Settings</Nav.Link>
          </Nav.Item>
        </Nav>
        {tabName === "search" && (
          <div className="full-div">
            <FormControl className="query" ref={this.textInput} type="text" placeholder="Search for a song..." defaultValue={query} onKeyPress={this.handleKeyPress} onChange={() => this.handleChange()} />
            <div className={"flex-scrollable-search"}>
              {searchResults.map((value) => {
                return <Fade appear={true} in={true}>
                  <div className={"flex-item-clickable"} onClick={() => this.onChange(value)}>
                    <img className={"album"} src={value["image"]}></img>
                    <div className={"song-info"}>
                      <div className={"player-details"}>
                        <div>
                          <div>{value["value"]}</div>
                          <div>{value["artist"]}</div>
                        </div>
                        <div className={"addButton"}>
                          <span className={"control-fa"}>
                            <FontAwesomeIcon icon={faPlus} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Fade>
              })}
            </div>
          </div>
        )}
        {tabName == "playlists" && (
          <div className="full-div">
           <div className={"flex-scrollable"}>
              {playlists.map((value, index) => {
                return (
                  <Accordion>
                    <Accordion.Toggle as={"div"} eventKey={index} onClick={() => this.getPlaylistTracks(value["uri"], index)}>
                      <Fade appear={true} in={true}>
                        <div className={"flex-item-clickable"}>
                          <img className={"album"} src={value["image"]}></img>
                            <div className={"song-info"}>
                              <div className={"player-details"}>
                                <div>
                                  <div>{value["value"]}</div>
                                  <div>{value["artist"]}</div>
                                </div>
                                <div className={"addButton"}>
                                  <span className={"control-fa"}>
                                    <FontAwesomeIcon icon={faAngleDown} />
                                  </span>
                                </div>
                              </div>
                            </div>
                        </div>
                      </Fade>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey={index}>
                      <div>
                        {value["results"] && value["results"].map((next) => {
                          return <Fade appear={true} in={true}>
                            <div className={"flex-item-clickable"} onClick={() => this.onChange(next)}>
                              <img className={"album"} src={next["image"]}></img>
                              <div className={"song-info"}>
                                <div className={"player-details"}>
                                  <div>
                                    <div>{next["value"]}</div>
                                    <div>{next["artist"]}</div>
                                  </div>
                                  <div className={"addButton"}>
                                    <span className={"control-fa"}>
                                      <FontAwesomeIcon icon={faPlus} />
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Fade>
                        })}
                      </div>
                    </Accordion.Collapse>
                  </Accordion>
              )})}
           </div>
          </div>
        )}
        {tabName == "queue" && (
          <div className="full-div">
            <div className={"flex-scrollable"}>
              {selectedOptions.map((value) => {
                return <Fade appear={true} in={true}>
                  <div className={"flex-item"}>
                    <img className={"album"} src={value["image"]}></img>
                    <div className={"song-info"}>
                      <div className={"player-details"}>
                        <div>
                          <div>{value["value"]}</div>
                          <div>{value["artist"]}</div>
                        </div>
                        <div className={"addButton"}  onClick={() => this.remove(value["id"])}>
                          <span className={"control-fa"}>
                            <FontAwesomeIcon icon={faTimes} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Fade>
              })}
            </div>
          </div>
        )}
        {tabName == "settings" && (
          <div className="full-div">
            <div className={"flex-scrollable"}>
              <Button variant="danger" className="flex-button" onClick={this.deleteRoom}>Delete Room</Button>
            </div>
          </div>
        )}
      </div>
    )
  }
}

export default Search

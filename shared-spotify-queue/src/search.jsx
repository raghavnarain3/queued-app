import React from 'react'
import Button from 'react-bootstrap/Button';
import Nav from 'react-bootstrap/Nav'
import Accordion from 'react-bootstrap/Accordion'
import Badge from 'react-bootstrap/Badge'
import FormControl from 'react-bootstrap/FormControl'
import ProgressBar from 'react-bootstrap/ProgressBar'
import Modal from 'react-bootstrap/Modal'
import socketIOClient from "socket.io-client";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { faPlay, faPause, faForward, faPlus, faAngleDown, faArrowUp, faArrowDown, faEllipsisV} from '@fortawesome/free-solid-svg-icons'

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
    showModal: false,
    showPlaylistModal: false,
    modalSong: {},
    modalPlaylist: {},
    access_key: localStorage.getItem("access_key"),
  }

  constructor(props) {
    super(props)
    this.textInput = React.createRef();
    if(localStorage.getItem("access_key") === null || localStorage.getItem("refresh_key") == null) {
      const url = process.env.REACT_APP_BACKEND_URL + "/login?room=" + this.props.match.params.room;
      window.location.assign(url);
    }
  }


  handleChange() {
    this.setState({ query: this.textInput.current.value }, () => {
      this.search();
    })
  }

  componentDidMount() {
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

  refreshToken = () => {
    const client_id = process.env.REACT_APP_CLIENT_ID
    const client_secret = process.env.REACT_APP_CLIENT_SECRET

    fetch('https://accounts.spotify.com/api/token', {
      method: 'post',
      headers: {
        'Authorization': 'Basic ' + btoa(`${client_id}:${client_secret}`),
        'Content-Type':'application/x-www-form-urlencoded',
      },
      body: `grant_type=refresh_token&refresh_token=${localStorage.getItem('refresh_key')}`,
    })
      .then(response => response.json())
      .then(json => {
        localStorage.setItem("access_key", json.access_token);
        this.setState({ access_key: json.access_token })
      })

  }

  search = () => {
    const { query, access_key } = this.state

    fetch('https://api.spotify.com/v1/search?q=' + query + '&type=track', {
      headers: { 'Authorization': 'Bearer ' + access_key },
    })
      .then(response => response.json())
      .then(json => {
        if (json["tracks"]) {
          let results = json["tracks"]["items"].map((item) => (
            { value: item["name"], artist: item["artists"][0]["name"], uri: item["uri"], image: item["album"]["images"][0]["url"], duration: item["duration_ms"], progress: 0, is_playing: true }
          ))
          this.setState({ searchResults: results })
        } else if (json.error.status === 401) {
          this.refreshToken();
          this.search();
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
    this.handleCloseModal()
  }

  getPlaylists = () => {
    const { access_key } = this.state

    fetch('https://api.spotify.com/v1/me/playlists', {
      headers: { 'Authorization': 'Bearer ' + access_key },
    })
      .then(response => response.json())
      .then(json => {
        console.log(json)
        if (json["items"]) {
          let results = json["items"].map((item) => (
            { value: item["name"], artist: item["owner"]["display_name"], uri: item["tracks"]["href"], image: item["images"][0]["url"] }
          ))
          this.setState({ playlists: results })
        } else if (json.error.status === 401) {
          this.refreshToken();
          this.getPlaylists();
        } else {
          this.setState({ playlists: [] })
        }
      })
  }

  getPlaylistTracks = (value) => {
    const { playlists, access_key } = this.state
    this.setState({showPlaylistModal: true, modalPlaylist: value})
    fetch(value.uri, {
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
            { value: item["track"]["name"], artist: item["track"]["artists"][0]["name"], uri: item["track"]["uri"], image: item["track"]["album"]["images"][0]["url"], duration: item["track"]["duration_ms"], progress: 0, is_playing: true }
          ))
          value["results"] = results
          this.setState({ playlists: playlists })
        } else if (json.error.status === 401) {
          this.refreshToken();
          this.getPlaylistTracks(value);
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
    toast.info(`Added ${selectedOption["value"]} to the queue`);
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
    if (selectedKey === "playlists") {
      this.getPlaylists()
      this.setState({ tabName: "playlists" });
    } else {
      this.setState({ tabName: selectedKey });
    }
  }

  showModalOptions = (value) => {
    this.setState({ modalSong: value, showModal: true})
  }

  showModalPlaylistOptions = (value) => {
    this.setState({ modalPlaylist: value, showPlaylistModal: true})
  }

  handleCloseModal = () => {
    this.setState({ showModal: false})
  }

  handleClosePlaylistModal = () => {
    this.setState({ showPlaylistModal: false})
  }

  vote = (id, count) => {
    const { room } = this.props.match.params
    const { socket } = this.state;
    var message = {room: room, id: id, count: count}
    socket.emit('vote', message);
    this.handleCloseModal()
  }

  render() {
    const { room } = this.props.match.params
    const { selectedOptions, currentSong, tabName, query, searchResults, playlists, showModal, modalSong, showPlaylistModal, modalPlaylist } = this.state
  	return (
      <>
      <ToastContainer
        position="top-right"
        autoClose={2000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      <div className={"flex-container"}>
        <Modal show={showModal} onHide={this.handleCloseModal}>
          <Modal.Header closeButton>
            <Modal.Title as="b">
              Update Queue
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className={"flex-item"}>
              <img className={"album"} src={modalSong["image"]}></img>
              <div className={"song-info"}>
                <div className={"player-details"}>
                  <div>
                    <div>{modalSong["value"]}</div>
                    <div>{modalSong["artist"]}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className={"flex-row-container"}>
              <div className={"flex-row-container"}>
                <div className={"upvote"}>
                  <Button variant="outline-success" onClick={() => this.vote(modalSong.id, 1)}>Upvote <FontAwesomeIcon icon={faArrowUp} /></Button>
                </div>
                <div>
                  <Button variant="outline-danger" onClick={() => this.vote(modalSong.id, -1)}>Downvote <FontAwesomeIcon icon={faArrowDown} /></Button>
                </div>
              </div>
              <Button variant="danger" onClick={() => this.remove(modalSong.id)}>Remove</Button>
            </div>
          </Modal.Body>
        </Modal>
        <Modal show={showPlaylistModal} onHide={this.handleClosePlaylistModal}>
          <Modal.Header closeButton>
            <Modal.Title as="b">
              Add Songs from Playlist
            </Modal.Title>
          </Modal.Header>
          <Modal.Body scrollable={true}>
            <div className={"flex-item"}>
              <img className={"album"} src={modalPlaylist["image"]}></img>
              <div className={"song-info"}>
                <div className={"player-details"}>
                  <div>
                    <div>{modalPlaylist["value"]}</div>
                    <div>{modalPlaylist["artist"]}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className={"top-border-box"}>
            <div className={"flex-scrollable-modal"}>
              {modalPlaylist["results"] && modalPlaylist["results"].map((next) => {
                return <div className={"flex-item-clickable"} onClick={() => this.onChange(next)}>
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
              })}
              </div>
            </div>
          </Modal.Body>
        </Modal>
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
                return <div key={value.uri} className={"flex-item-clickable"} onClick={() => this.onChange(value)}>
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
              })}
            </div>
          </div>
        )}
        {tabName == "playlists" && (
          <div className="full-div">
           <div className={"flex-scrollable"}>
              {playlists.map((value) => {
                return (
                  <div key={value.uri} className={"flex-item-clickable"} onClick={() => this.getPlaylistTracks(value)}>
                    <img className={"album"} src={value["image"]}></img>
                      <div className={"song-info"}>
                        <div className={"player-details"}>
                          <div>
                            <div>{value["value"]}</div>
                            <div>{value["artist"]}</div>
                          </div>
                          <div className={"addButton"}>
                            <span className={"control-fa"}>
                              <FontAwesomeIcon icon={faEllipsisV} />
                            </span>
                          </div>
                        </div>
                      </div>
                  </div>
              )})}
           </div>
          </div>
        )}
        {tabName === "queue" && (
          <div className="full-div">
            <div className="flex-scrollable">
              {selectedOptions.map((value) => {
                return <div key={value.id} className={"flex-item-clickable"} onClick={() => this.showModalOptions(value)}>
                  <img className={"album"} src={value["image"]}></img>
                  <div className={"song-info"}>
                    <div className={"player-details"}>
                      <div>
                        <div>{value["value"]}</div>
                        <div>{value["artist"]}</div>
                      </div>
                      <div className={"controls"}>
                        <Badge variant="primary" className="play">{value.votes}</Badge>
                        <span className={"control-fa"}>
                          <FontAwesomeIcon icon={faEllipsisV} />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              })}
            </div>
          </div>
        )}
        {tabName === "settings" && (
          <div className="full-div">
            <div className={"flex-scrollable"}>
              <Button variant="danger" className="flex-button" onClick={this.deleteRoom}>Delete Room</Button>
            </div>
          </div>
        )}
      </div>
      </>
    )
  }
}

export default Search

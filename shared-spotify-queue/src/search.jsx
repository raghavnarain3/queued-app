import React from 'react'
import ReactGA from 'react-ga'
import ReactLoading from 'react-loading';
import { FixedSizeList as List } from "react-window";
import Button from 'react-bootstrap/Button';
import Nav from 'react-bootstrap/Nav'
import Badge from 'react-bootstrap/Badge'
import FormControl from 'react-bootstrap/FormControl'
import FormCheck from 'react-bootstrap/FormCheck'
import ProgressBar from 'react-bootstrap/ProgressBar'
import Modal from 'react-bootstrap/Modal'
import socketIOClient from "socket.io-client";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { ToastContainer, toast } from 'react-toastify';
import Truncate from 'react-truncate';
import copy from 'copy-to-clipboard';
import 'react-toastify/dist/ReactToastify.css';
import Checkbox from 'react-checkbox-component'
import { faBeer, faPlay, faPause, faForward, faPlus, faAngleDown, faArrowUp, faArrowDown, faEllipsisV, faCopy } from '@fortawesome/free-solid-svg-icons'

class Search extends React.Component {
  state = {
    user: { id: null, name: null, img: null },
    users: [],
    owner: { id: null, name: null },
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
    access_key: localStorage.getItem("ak"),
    connectedToRoom: false,
  }

  constructor(props) {
    super(props)
    this.textInput = React.createRef();
    if(localStorage.getItem("ak") === null || localStorage.getItem("rk") == null) {
      const url = process.env.REACT_APP_BACKEND_URL + "/login?room=" + this.props.match.params.room;
      window.location.assign(url);
    }
    const googleAnalyticsKey = process.env.REACT_APP_GOOGLE_ANALYTICS
    if (googleAnalyticsKey) {
      ReactGA.initialize(googleAnalyticsKey);
      ReactGA.pageview('/room');
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

    const { query, access_key } = this.state
    
    socket.on('users', data => {
      this.setState({ users: data })
    });
    socket.on('queue', data => {
      this.setState({ selectedOptions: data["queue"], currentSong: data["currently_playing"] || {}, owner: data.owner });
    });
    socket.on("reconnect", () => {
      const { user } = this.state;
      socket.emit('join room', {room: room, user: user })
      console.log("reconnected");
    });

    socket.on('connected in room', data => {
      this.setState({ connectedToRoom: data })
    })

    socket.on('play error', data => {
      console.log("play error")
      toast.info("To get started, the owner must start playing music through their Spotify app", {autoClose: false})
    })

    socket.on('no room', data => {
      console.log("play error")
      toast.info("The room doesn't exist. Make sure you have the correct room code", {autoClose: false})
    })

    this.setState({ socket: socket }, this.joinRoom);
  }

  openInNewTab = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  joinRoom = () => {
    const { access_key, socket, user } = this.state
    const { room } = this.props.match.params

    fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': 'Bearer ' + access_key },
    })
      .then(response => response.json())
      .then(json => {
        if (json.id) {
          if (json.images.length > 0) {
            var image = json.images[0].url
          } else {
            var image = null
          }
          var user = { id: json.id, name: json.display_name, img: image }
          this.setState({ user: user })
          socket.emit('join room', {room: room, user: user })
          socket.emit('connected to room?', { room: room, access_key: access_key, user_id: user.id });
        } else if (json.error.status === 401) {
          this.refreshToken();
          this.joinRoom();
        } else {
          socket.emit('join room', {room: room, user: { id: null, user: "Guest", img: null } })
        }
      })
  }

  refreshToken = () => {
    const { connectedToRoom, socket, access_key, user } = this.state
    const { room } = this.props.match.params

    const client_id = process.env.REACT_APP_CLIENT_ID
    const client_secret = process.env.REACT_APP_CLIENT_SECRET

    fetch('https://accounts.spotify.com/api/token', {
      method: 'post',
      headers: {
        'Authorization': 'Basic ' + btoa(`${client_id}:${client_secret}`),
        'Content-Type':'application/x-www-form-urlencoded',
      },
      body: `grant_type=refresh_token&refresh_token=${localStorage.getItem('rk')}`,
    })
      .then(response => response.json())
      .then(json => {
        localStorage.setItem("ak", json.access_token);
        this.setState({ access_key: json.access_token })
        if (connectedToRoom) {
          socket.emit('update connected room', { room: room, new_token: json.access_token, user_id: user.id })
        }
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

    fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { 'Authorization': 'Bearer ' + access_key },
    })
      .then(response => response.json())
      .then(json => {
        if (json["items"]) {
          let results = json["items"].map((item) => (
            { value: item["name"], artist: item["owner"]["display_name"], uri: item["tracks"]["href"], image: item.images[0] ? item.images[0].url : null }
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

  getTracks = (url, tracks) => {
    const { access_key } = this.state
    return new Promise((resolve, reject) => fetch(url, {
      headers: { 'Authorization': 'Bearer ' + access_key }
    })
      .then(response => response.json()).catch(reject)
        .then(json => {
          if (json.items) {
            let results = json.items.filter((item) => {
              if (item.track) {
                return true
              } else {
                return false
              }
            }).map((item) => (
              {
                value: item.track.name,
                artist: item.track.artists[0].name,
                uri: item.track.uri,
                image: item.track.album.images[0] ? item.track.album.images[0].url : null,
                duration: item.track.duration_ms,
                progress: 0,
                is_playing: true
              }
            ))
            tracks = tracks.concat(results)

            if (json.next) {
              this.getTracks(json.next, tracks).then(resolve).catch(reject)
            } else {
              resolve(tracks);
            }
          } else if (json.error.status === 401) {
            this.refreshToken();
            this.getTracks(url, tracks);
          }
        }).catch(reject))
  }

  getPlaylistTracks = (value) => {
    this.setState({showPlaylistModal: true, modalPlaylist: value})
    if (!value.results) {
      this.getTracks(value.uri, []).then(tracks => {
        value.results = tracks
        this.setState({ modalPlaylist: value })
      }).catch(console.error)
    }
  }

  handleKeyPress = (event) => {
    if (event.key === "Enter") {
      this.textInput.current.blur()
    }
  }

  onChange = (selectedOption) => {
    const { room } = this.props.match.params
    const { socket, user, currentSong, selectedOptions } = this.state;
    var message = {room: room, selectedOption: {...selectedOption, user: user}}
    if(selectedOptions.length == 0 || !currentSong.value) {
      toast.info("To get started, the owner must start playing music through their Spotify app", {autoClose: false})
    }
    socket.emit('add', message);
    toast.info(({ closeToast }) => {
      return (
        <>
          <div><b>Added Song</b></div>
          <div>{selectedOption["value"]}</div>
        </>
      )
    });
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

  toggleConnectToRoom = () => {
    const { room } = this.props.match.params
    const { connectedToRoom, access_key, socket, user } = this.state;
    socket.emit('connect to room', {room: room, user_id: user.id, access_key: access_key, refresh_key: localStorage.getItem('rk'), should_connect: !connectedToRoom})
    this.setState({ connectedToRoom: !connectedToRoom})
  }

  isOwner = () => {
    const { owner, user } = this.state
    return user.id === owner.id || user.id === "1292289339";
  }

  isOwnerWithoutMe = () => {
    const { owner, user } = this.state
    return user.id === owner.id;
  }

  vote = (id, count, double) => {
    if(double) {
      count = count * 2;
    }
    const { room } = this.props.match.params
    const { socket, user } = this.state;
    var message = {room: room, id: id, count: count, user: user}
    socket.emit('vote', message);
    this.handleCloseModal()
  }

  getIndex = (arr, user_id) => {
    for(var i = 0; i < arr.length; i++) {
      if(arr[i].id === user_id) {
        return i;
      }
    }
      return -1; //to handle the case where the value doesn't exist
  }

  getImage = (img) => {
    if(img) {
      return img
    }

    return "/empty_user.png"
  }

  copyText = () => {
    const { room } = this.props.match.params

    copy(`http://cueued.com/room/${room}`)
    toast.info("Copied shareable url");
  }

  render() {
    const { room } = this.props.match.params
    const { owner, user, selectedOptions, currentSong, tabName, query, searchResults, playlists, showModal, modalSong, showPlaylistModal, modalPlaylist, connectedToRoom } = this.state
    const Row = ({ index, style }) => {
      return <div style={{
        ...style,
        top: style.top + 10,
        height: style.height - 10
      }}>
        <div key={index} className={"flex-item-clickable"} onClick={() => this.onChange(modalPlaylist.results[index])}>
          <img className={"album"} src={modalPlaylist.results[index].image}></img>
          <div className={"song-info"}>
            <div className={"player-details"}>
              <div>
                <div><Truncate width={175}>{modalPlaylist.results[index].value}</Truncate></div>
                <div><Truncate width={175}>{modalPlaylist.results[index].artist}</Truncate></div>
              </div>
              <div className={"addButton"}>
                <span className={"control-fa"}>
                  <FontAwesomeIcon icon={faPlus} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    };

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
            {modalSong.user && (
              <div className={"added-by-item"}>
                <img className={"user-img"} src={this.getImage(modalSong.user.img)}></img>
                <div className={"user-name"}>{modalSong.user.name}</div>
              </div>
            )}
            <div className={"flex-item"}>
              <img className={"album"} src={modalSong["image"]}></img>
              <div className={"song-info"}>
                <div className={"player-details"}>
                  <div>
                    <div><Truncate width={175}>{modalSong["value"]}</Truncate></div>
                    <div><Truncate width={175}>{modalSong["artist"]}</Truncate></div>
                  </div>
                  <div className={"controls"}>
                    {modalSong.upvotes && (<Badge variant="primary" className="play">{modalSong.upvotes.length - modalSong.downvotes.length}</Badge>)}
                  </div>
                </div>
              </div>
            </div>
            <div className={"flex-row-container"}>
              <div className={"flex-row-container"}>
                <div className={"upvote"}>
                  <div className="votes-list">
                    <div>Upvoted By:</div>
                    {modalSong && modalSong.upvotes && modalSong.upvotes.map((user, index) => {
                      return <div key={index} className={"user-list-item"}>
                        <img className={"user-img"} src={this.getImage(user.img)}></img>
                        <div className={"user-name"}>{user.name}</div>
                      </div>
                    })}
                  </div>
                  <Button className={"vote-button"} variant="outline-success" disabled={ (modalSong.upvotes && this.getIndex(modalSong.upvotes, user.id) !== -1) } onClick={() => this.vote(modalSong.id, 1, this.getIndex(modalSong.downvotes, user.id) !== -1)}>Upvote <FontAwesomeIcon icon={faArrowUp} /></Button>
                </div>
                <div>
                  <div className="votes-list">
                    <div>Downvoted By:</div>
                    {modalSong && modalSong.downvotes && modalSong.downvotes.map((user, index) => {
                      return <div key={index} className={"user-list-item"}>
                        <img className={"user-img"} src={this.getImage(user.img)}></img>
                        <div className={"user-name"}>{user.name}</div>
                      </div>
                    })}
                  </div>
                  <Button className={"vote-button"} variant="outline-danger" disabled={ (modalSong.downvotes && this.getIndex(modalSong.downvotes, user.id) !== -1) } onClick={() => this.vote(modalSong.id, -1, this.getIndex(modalSong.upvotes, user.id) !== -1)}>Downvote <FontAwesomeIcon icon={faArrowDown} /></Button>
                </div>
              </div>
              {(this.isOwner() || (modalSong.user && modalSong.user.id === user.id)) && (
                <div>
                  <div className="votes-list"></div>
                  <Button variant="danger" onClick={() => this.remove(modalSong.id)}>Remove</Button>
                </div>
              )}
            </div>
          </Modal.Body>
        </Modal>
        <Modal show={showPlaylistModal} onHide={this.handleClosePlaylistModal}>
          <Modal.Header closeButton>
            <Modal.Title as="b">
              Add Songs from Playlist
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className={"flex-item"}>
              <img className={"album"} src={modalPlaylist["image"]}></img>
              <div className={"song-info"}>
                <div className={"player-details"}>
                  <div>
                    <div><Truncate width={175}>{modalPlaylist["value"]}</Truncate></div>
                    <div><Truncate width={175}>{modalPlaylist["artist"]}</Truncate></div>
                  </div>
                </div>
              </div>
            </div>
            <div className={"top-border-box"}>
              <div className={"flex-scrollable-modal"}>
                {modalPlaylist["results"] && (
                  <List
                    height={250}
                    itemCount={modalPlaylist.results.length}
                    itemSize={100}
                    width={"100%"}
                    overscanCount={5}
                  >
                    {Row}
                  </List>
                )}

                {!modalPlaylist["results"] && (
                  <ReactLoading type={"bars"} height={50} width={50} />
                )}
              </div>
            </div>
          </Modal.Body>
        </Modal>
        <div>{owner.name}'s Room: <b>{room}</b></div>
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
                    {this.isOwner() && (
                      <span className={"play"} onClick={this.playOrPause}>
                        <FontAwesomeIcon icon={currentSong["is_playing"] ? faPause : faPlay} />
                      </span>
                    )}
                    {this.isOwner() && (
                      <span className={"control-fa"} onClick={this.nextSong}>
                        <FontAwesomeIcon icon={faForward} />
                      </span>
                    )}
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
                    <div><Truncate width={175}>{currentSong["value"]}</Truncate></div>
                    <div><Truncate width={175}>{currentSong["artist"]}</Truncate></div>
                  </div>
                  <div className={"controls"}>
                    <span className={this.isOwner() ? "play" : "play-without-next"} onClick={this.playOrPause}>
                      <FontAwesomeIcon icon={currentSong["is_playing"] ? faPause : faPlay} />
                    </span>
                    {this.isOwner() && (
                      <span className={"control-fa"} onClick={this.nextSong}>
                        <FontAwesomeIcon icon={faForward} />
                      </span>
                    )}
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
              {searchResults.map((value, index) => {
                return <div key={index} className={"flex-item-clickable"} onClick={() => this.onChange(value)}>
                  <img className={"album"} src={value["image"]}></img>
                  <div className={"song-info"}>
                    <div className={"player-details"}>
                      <div>
                        <div><Truncate width={175}>{value["value"]}</Truncate></div>
                        <div><Truncate width={175}>{value["artist"]}</Truncate></div>
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
              {playlists.map((value, index) => {
                return (
                  <div key={index} className={"flex-item-clickable"} onClick={() => this.getPlaylistTracks(value)}>
                    <img className={"album"} src={value["image"]}></img>
                      <div className={"song-info"}>
                        <div className={"player-details"}>
                          <div>
                            <div><Truncate width={175}>{value["value"]}</Truncate></div>
                            <div><Truncate width={175}>{value["artist"]}</Truncate></div>
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
              {(selectedOptions.length == 0 || currentSong["value"] == null) && (
                <>
                <div className={"flex-item-clickable"}>
                  <img className={"album"}></img>
                  <div className={"song-info"}>
                      <div className={"player-details"}>
                        <div>
                          <div>Cueued can only take over if you have premium and when you start playing the spotify app on your device of choice!</div>
                        </div>
                      </div>
                  </div>
                </div>
                <div className={"flex-item-clickable"}>
                  <img className={"album"}></img>
                  <div className={"song-info"}>
                      <div className={"player-details"}>
                        <div>
                          <div>Make sure the "repeat" button is turned off on spotify</div>
                        </div>
                      </div>
                  </div>
                </div>
                <div className={"flex-item-clickable"}>
                  <img className={"album"}></img>
                  <div className={"song-info"}>
                      <div className={"player-details"}>
                        <div>
                          <div>Don't forget to clear the room when you're done with it!</div>
                        </div>
                      </div>
                  </div>
                </div>
                </>
              )}
              {selectedOptions.map((value, index) => {
                return <div key={index} className={"flex-item-clickable"} onClick={() => this.showModalOptions(value)}>
                  <img className={"album"} src={value["image"]}></img>
                  <div className={"song-info"}>
                    <div className={"player-details"}>
                      <div>
                        <div><Truncate width={175}>{value["value"]}</Truncate></div>
                        <div><Truncate width={175}>{value["artist"]}</Truncate></div>
                      </div>
                      <div className={"controls"}>
                        <Badge variant="primary" className="play">{value.upvotes.length - value.downvotes.length}</Badge>
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
              <div className="shareable-link">
                <FormControl className="shareable-link-input" readOnly defaultValue={`http://cueued.com/room/${room}`}></FormControl>
                <Button onClick={() => this.copyText()}><FontAwesomeIcon icon={faCopy} /></Button>
              </div>
              {!this.isOwnerWithoutMe() && (
                <div className="connect-to-room-check">
                  <Checkbox
                    isChecked={connectedToRoom}
                    color={"#eb906e"}
                    size="big"
                    onChange={() => this.toggleConnectToRoom()}
                  >
                  </Checkbox>
                  <div className="connect-to-room-label" >Connect to the Room</div>
                </div>
              )}
              <Button variant="primary" className="flex-button" onClick={() => this.openInNewTab("https://www.buymeacoffee.com/raghavnarain3")}><FontAwesomeIcon icon={faBeer} /> Buy Me a Beer!</Button>
              {this.isOwner() && (<Button variant="danger" className="flex-button" onClick={this.deleteRoom}>Delete Room</Button>)}
            </div>
          </div>
        )}
      </div>
      </>
    )
  }
}

export default Search

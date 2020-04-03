import React from 'react'
import Select from 'react-select'
import Button from 'react-bootstrap/Button';
import AsyncSelect from 'react-select/async'
import socketIOClient from "socket.io-client";

class Search extends React.Component {
  state = {
    selectedOptions: [],
    currentSong: "",
    endpoint: process.env.REACT_APP_SOCKET,
    socket: null
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
      this.setState({ selectedOptions: data["queue"], currentSong: data["current_song"] });
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
          { value: item["name"], label: item["name"], uri: item["uri"] }
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

  render() {
    const { room } = this.props.match.params
    const { selectedOptions, currentSong } = this.state
    console.log(selectedOptions)
  	return (
      <div className={"flex-container"}>
        <h3>Welcome to room: {room}</h3>
        <h3>Current Song: {currentSong}</h3>
        <h3>Search for a song...</h3>
		    <AsyncSelect className="select"
                loadOptions={this.loadOptions}
                onChange={this.onChange}
        />
        {selectedOptions.map((value) => {
          return <div className={"flex-item"}>{value["value"]}</div>
        })}
        <Button variant="danger" className="flex-button" onClick={this.deleteRoom}>Delete Room</Button>
      </div>
    )
  }
}

export default Search

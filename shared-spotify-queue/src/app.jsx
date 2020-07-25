import React from 'react'
import Button from 'react-bootstrap/Button';
import FormControl from 'react-bootstrap/FormControl'
import { Link } from 'react-router-dom'

class App extends React.Component {
  state = {
    room: ""
  }

  constructor() {
    super()
    this.textInput = React.createRef();
  }


  handleChange() {
    this.setState({ room: this.textInput.current.value })
  }

  onClick() {
    const url = process.env.REACT_APP_BACKEND_URL + "/login?room=" + this.textInput.current.value
    window.location.assign(url)
  }

  render() {
    const { room } = this.state

    return (
      <div className={"flex-container"}>
        <h1>Cueued</h1>
        <Button className= "flex-button" href={process.env.REACT_APP_BACKEND_URL + "/create-room"}>Start a Room!</Button>
        <h3> or </h3>
        <div>
          <FormControl className="room" ref={this.textInput} type="text" placeholder="Room..." default={room} onChange={() => this.handleChange()} />
        </div>
        <Button className="flex-button" onClick={() => this.onClick()}>Join a Room!</Button>
      </div>
    )
  }
}

export default App

import React from 'react'
import Button from 'react-bootstrap/Button';
import FormControl from 'react-bootstrap/FormControl'
import Modal from 'react-bootstrap/Modal'

class App extends React.Component {
  state = {
    room: "",
    learnMoreModal: false,
  }

  constructor() {
    super()
    this.textInput = React.createRef();
  }

  handleChange() {
    this.setState({ room: this.textInput.current.value })
  }

  onClick() {
    const url = process.env.REACT_APP_BACKEND_URL + "/login?room=" + this.textInput.current.value.toLowerCase()
    window.location.assign(url)
  }

  showLearnMore() {
    this.setState({ learnMoreModal: true })
  }

  handleCloseModal() {
    this.setState({ learnMoreModal: false })
  }

  render() {
    const { room, learnMoreModal } = this.state

    return (
      <div className={"flex-container"}>
        <Modal show={learnMoreModal} onHide={() => this.handleCloseModal()}>
          <Modal.Header closeButton>
            <Modal.Title as="b">
              How To Use Cueued
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="steps"> <b>Cueued creates a collaborative queue for your Spotify that allows multiple people to determine what music gets played next.</b></div>
            <div className="steps"> <b>To get started:</b></div>
            <div className="steps"> 1. Start playing Spotify music on your device of choice (phone, smart device, TV, ipad, etc)</div>
            <div className="steps"> 2. Create a room through cueued (you must have Spotify premium)</div>
            <div className="steps"> 3. Share the room link to your friends (they don't need premium)</div>
            <div className="steps"> 4. Add songs to the queue</div>
            <div className="steps"> 5. The music on your device should now be taken over by cueued!</div>
            <div className="steps"> 6. Go to the queue and upvote/downvote songs to determine what gets played next</div>
            <div className="steps"> 7. The creator of the room can look through their playlists and choose one of them as backup in case the queue gets empty</div>
            <div className="steps"> 8. If your friends are remote and and want to listen to the cueued, they can start playing Spotify from their devince, click Connect To Room in the Settings and then be able to listen remotely! (they must have Spotify premium)</div>
            <div className="steps"> 9. Once you're done with the session, don't forget to delete the room in the Settings!</div>
          </Modal.Body>
        </Modal>
        <h1>cueued</h1>
        <div>
          A service to dem<b>aux</b>ratize your Spotify music.{' '}
          <a href="#" onClick={() => this.showLearnMore()}>Learn more</a>
        </div>
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

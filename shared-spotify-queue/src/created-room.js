import React from 'react'
import Button from 'react-bootstrap/Button';

class CreatedRoom extends React.Component {
  render() {
    const { room } = this.props.match.params
  	return (
      <div className={"flex-container"}>
        <div className={"info-text"}>Your room was created! To get started, start spotify on the device you wish to connect to, and once you join the room and add songs, cueued will take over! The room code is <b>{room}</b></div>
        <Button className="flex-button" href={process.env.REACT_APP_BACKEND_URL + "/login?room=" + room}>Join the Room!</Button>
      </div>
    )
  }
}

export default CreatedRoom

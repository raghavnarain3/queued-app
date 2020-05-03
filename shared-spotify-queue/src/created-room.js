import React from 'react'
import Button from 'react-bootstrap/Button';

class CreatedRoom extends React.Component {
  render() {
    const { room } = this.props.match.params
  	return (
      <div className={"flex-container"}>
        <div>Your room was created! The room code is <b>{room}</b></div>
        <Button className="flex-button" href={process.env.REACT_APP_BACKEND_URL + "/login?room=" + room}>Join the Room!</Button>
      </div>
    )
  }
}

export default CreatedRoom

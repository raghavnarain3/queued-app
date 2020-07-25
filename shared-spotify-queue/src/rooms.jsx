import React from 'react'
import ListGroup from 'react-bootstrap/ListGroup'
import { Link } from 'react-router-dom'
import socketIOClient from "socket.io-client";

class Rooms extends React.Component {
  state = {
    endpoint: process.env.REACT_APP_SOCKET,
    socket: null,
    rooms: [],
  }

  componentWillMount() {
    const { endpoint } = this.state;
    const socket = socketIOClient(endpoint);

    socket.emit('get rooms', {})
    socket.on('all rooms', data => {
      console.log(data);
      this.setState({ rooms: data })
    });
    this.setState({ socket: socket });
  }

	render() {
		const { rooms } = this.state
  	return (
      <div className={"flex-container"}>
        <ListGroup>
          {rooms.map(room => {
            return <Link to={"/room/" + room}><ListGroup.Item action>{room}</ListGroup.Item></Link>
          })}
        </ListGroup>
      </div>
    );
	}
}

export default Rooms

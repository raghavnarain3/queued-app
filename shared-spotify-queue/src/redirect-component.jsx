import React from 'react'
import { Redirect } from 'react-router-dom'

class RedirectComponent extends React.Component {
  constructor(props) {
    super(props)
    const { access_key, refresh_key } = this.props.match.params
    localStorage.setItem('ak', access_key);
    localStorage.setItem('rk', refresh_key);
    const { room } = this.props.match.params
    return this.props.history.push("/room/" + room);
  }

  render() {
  	return null;
  }
}

export default RedirectComponent

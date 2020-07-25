import React from 'react'
import  { Redirect } from 'react-router-dom'

class RedirectComponent extends React.Component {

  constructor() {
    super()
  }

	componentWillMount() {
	  const { room, access_key, refresh_key } = this.props.match.params
	  localStorage.setItem('access_key', access_key);
	  localStorage.setItem('refresh_key', refresh_key); 
	}

	render() {
		const { room, access_key, refresh_key } = this.props.match.params
  	return (<Redirect to={"/room/" + room} />);
	}
}

export default RedirectComponent

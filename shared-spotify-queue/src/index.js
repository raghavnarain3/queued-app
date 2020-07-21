import React from 'react';
import ReactDOM from 'react-dom';
import { Route, Link, BrowserRouter as Router } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import App from './app';
import Search from './search'
import CreatedRoom from './created-room'
import RedirectComponent from './redirect-component'
import * as serviceWorker from './serviceWorker';

const routing = (
  <Router>
    <div className={"full"}> 
      <Route exact path="/" component={App} />
      <Route path="/search/:room/:access_key/:refresh_key" component={RedirectComponent} />
      <Route path="/created-room/:room" component={CreatedRoom} />
      <Route path="/room/:room" component={Search} />
    </div>
  </Router>
);

ReactDOM.render(routing, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();

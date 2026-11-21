import React from 'react';
import ReactDOM from 'react-dom/client';
import { legacy_createStore as createStore, applyMiddleware } from 'redux';
import { Provider } from 'react-redux';
import { thunk } from 'redux-thunk';
import './index.css';
import App from './components/App';
import reducers from './reducers';
import * as serviceWorker from './serviceWorker';

const store = createStore(
  reducers,
  applyMiddleware(thunk)
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Provider store={store}>
    <App />
  </Provider>
);

serviceWorker.unregister();

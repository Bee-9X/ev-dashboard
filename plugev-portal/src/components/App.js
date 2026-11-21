//      .....................................................
//       __________
//      |     __   \
//      |_   |  |   \
//       |   |__|   /		               _____\""\   /""/
//       |    ___  (__                    /  __  \  \ /  /
//       |   |   |    ) ___   ___   ___  /  |  |  \  X  /
//      _|   |   |   / / _ \ / _ \ |___| \  |__|  /  X  \
//      |    |___|  / |  __/|  __/        \__    /  / \  \
//      |__________/   \___| \___|           /  /__/   \__\
//      I N N O V A T I O N S   L A B       /  /
//                                         /__/
//       .....................................................


import React from 'react';
import {connect} from 'react-redux';
import {Redirect, Route, Switch} from 'react-router';
import {HashRouter} from 'react-router-dom';
import {ToastContainer} from 'react-toastify';

/* eslint-disable */
import ErrorPage from '../pages/error';
/* eslint-enable */
import '../styles/theme.scss';
import LayoutComponent from '../components/Layout';
import Login from '../pages/authentication/login';
import Register from '../pages/authentication/register/register';
import ForgotPassword from "../pages/authentication/passwordReset";
import {logoutUser} from '../actions/user';

const PrivateRoute = ({dispatch, component, ...rest}) => {
    if (!Login.isAuthenticated(JSON.parse(localStorage.getItem('authenticated')))) {
        dispatch(logoutUser());
        return (<Redirect to="/login"/>)
    } else {
        return ( // eslint-disable-line
            <Route {...rest} render={props => (React.createElement(component, props))}/>
        );
    }
};

const CloseButton = ({closeToast}) => <i onClick={closeToast} className="la la-close notifications-close"/>

class App extends React.PureComponent {
    render() {
        return (
            <div>
                <ToastContainer
                    autoClose={5000}
                    hideProgressBar
                    closeButton={
                        <CloseButton/>
                    }/>
                <HashRouter>
                    <Switch>
                        <Route path="/" exact render={() => <Redirect to="/app/main"/>}/>
                        <Route path="/app" exact render={() => <Redirect to="/app/main"/>}/>
                        <PrivateRoute path="/app" dispatch={this.props.dispatch} component={LayoutComponent}/>
                        {/*<Route path="/register" exact component={Register}/>*/}
                        <Route path="/forgotPassword" exact component={ForgotPassword}/>
                        <Route path="/login" exact component={Login}/>
                        <Route path="/error" exact component={ErrorPage}/>
                        <Route component={ErrorPage}/>
                        <Redirect from="*" to="/app/main/dashboard"/>
                    </Switch>
                </HashRouter>
            </div>

        );
    }
}

const mapStateToProps = state => ({
    isAuthenticated: state.auth.isAuthenticated,
});

export default connect(mapStateToProps)(App);

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
import PropTypes from 'prop-types';
import {Link, Redirect, withRouter} from 'react-router-dom';
import {connect} from 'react-redux';

import logo from '../images/logo.png';
import google from '../images/Google_logo.svg';
import facebook from '../images/facebook_logo.svg';

import {Alert, Button, FormGroup, Input, InputGroup, InputGroupAddon, InputGroupText, Label} from 'reactstrap';
import {loginUser} from '../../../actions/user';
import {registerError, registerUser} from "../../../actions/register";

class Login extends React.Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);

        this.state = {
            loginEmail: '09madhuma@gmail.com',
            loginPassword: '123456',

            firstName: '',
            lastName: '',
            regEmail: '',
            phoneNumber: '',
            password: '',
            confirmPassword: '',
        };

        this.doLogin = this.doLogin.bind(this);
        this.loginEmail = this.loginEmail.bind(this);
        this.loginPassword = this.loginPassword.bind(this);
        this.forgotPassword = this.forgotPassword.bind(this);

        this.doRegister = this.doRegister.bind(this);
        this.firstName = this.firstName.bind(this);
        this.lastName = this.lastName.bind(this);
        this.regEmail = this.regEmail.bind(this);
        this.phoneNumber = this.phoneNumber.bind(this);
        this.changePassword = this.changePassword.bind(this);
        this.changeConfirmPassword = this.changeConfirmPassword.bind(this);
        this.checkPassword = this.checkPassword.bind(this);
        this.isPasswordValid = this.isPasswordValid.bind(this);

    }

    static isAuthenticated(token) {
        if (token) return true;
    }

    loginEmail(event) {
        this.setState({loginEmail: event.target.value});
    }

    loginPassword(event) {
        this.setState({loginPassword: event.target.value});
    }

    doLogin(e) {
        e.preventDefault();
        this.props.dispatch(loginUser({loginEmail: this.state.loginEmail, loginPassword: this.state.loginPassword}));
    }

    forgotPassword() {
        this.props.history.push('/forgotPassword');
    }


// ---------------------------------------------------------------register-------------------------------------------------


    firstName(event) {
        this.setState({firstName: event.target.value});
    }

    lastName(event) {
        this.setState({lastName: event.target.value});
    }

    phoneNumber(event) {
        this.setState({phoneNumber: event.target.value});
    }

    regEmail(event) {
        this.setState({regEmail: event.target.value});
    }

    changePassword(event) {
        this.setState({password: event.target.value});
    }

    changeConfirmPassword(event) {
        this.setState({confirmPassword: event.target.value});
    }

    checkPassword() {
        if (!this.isPasswordValid()) {
            if (!this.state.password) {
                this.props.dispatch(registerError("Password field is empty"));
            } else {
                this.props.dispatch(registerError("Passwords are not equal"));
            }
            setTimeout(() => {
                this.props.dispatch(registerError());
            }, 3 * 1000)
        }
    }

    isPasswordValid() {
        return this.state.password && this.state.password === this.state.confirmPassword;
    }

    doRegister(e) {
        e.preventDefault();
        if (!this.isPasswordValid()) {
            this.checkPassword();
        } else {
            this.props.dispatch(registerUser({
                creds: {
                    email: this.state.email,
                    password: this.state.password
                },
                history: this.props.history
            }));
        }
    }


    componentDidMount() {

        const loginBtn = document.getElementById("loginBtn");
        const registerBtn = document.getElementById("registerBtn");
        const loginForm = document.getElementById("loginForm");
        const registerForm = document.getElementById("registerForm");
        const forgot = document.getElementById("forgot");
        const formBox = document.getElementById("formContainer");

        registerBtn.onclick = function () {

            registerForm.style.left = '0px';
            registerForm.style.opacity = '1';

            loginForm.style.left = '-600px';
            loginForm.style.opacity = '0';

            forgot.style.bottom = '-60px';
            forgot.style.opacity = '0';

            registerBtn.classList.add('active');

            loginBtn.classList.remove('active');

            formBox.style.overflow = 'scroll';

        }

        loginBtn.onclick = function () {
            loginForm.style.left = '0px';
            loginForm.style.opacity = '1';

            forgot.style.bottom = '0px';
            forgot.style.opacity = '1';

            registerForm.style.opacity = '0';
            registerForm.style.left = '600px';

            loginBtn.classList.add('active');

            registerBtn.classList.remove('active');

            formBox.style.overflow = 'hidden';
        }
    }


    render() {
        const {from} = this.props.location.state || {from: {pathname: '/app'}}; // eslint-disable-line

        // cant access login page while logged in
        if (Login.isAuthenticated(JSON.parse(localStorage.getItem('authenticated')))) {
            return (
                <Redirect to={from}/>
            );
        }


        // const regForm = () => {
        //
        //     const loginBtn = document.getElementById("loginBtn");
        //     const registerBtn = document.getElementById("registerBtn");
        //     const loginForm = document.getElementById("loginForm");
        //     const registerForm = document.getElementById("registerForm");
        //     const forgot = document.getElementById("forgot");
        //     const formBox = document.getElementById("formContainer");
        //
        //     registerForm.style.left = '0px';
        //     registerForm.style.opacity = '1';
        //
        //     loginForm.style.left = '-600px';
        //     loginForm.style.opacity = '0';
        //
        //     forgot.style.bottom = '-60px';
        //     forgot.style.opacity = '0';
        //
        //     registerBtn.classList.add('active');
        //
        //     loginBtn.classList.remove('active');
        //
        //     formBox.style.overflow = 'scroll';
        //
        // }
        //
        // const logForm = () => {
        //
        //     const loginBtn = document.getElementById("loginBtn");
        //     const registerBtn = document.getElementById("registerBtn");
        //     const loginForm = document.getElementById("loginForm");
        //     const registerForm = document.getElementById("registerForm");
        //     const forgot = document.getElementById("forgot");
        //     const formBox = document.getElementById("formContainer");
        //
        //     loginForm.style.left = '0px';
        //     loginForm.style.opacity = '1';
        //
        //     forgot.style.bottom = '0px';
        //     forgot.style.opacity = '1';
        //
        //     registerForm.style.opacity = '0';
        //     registerForm.style.left = '600px';
        //
        //     loginBtn.classList.add('active');
        //
        //     registerBtn.classList.remove('active');
        //
        //     formBox.style.overflow = 'hidden';
        //
        // }

        return (
            <div className="auth-page">

                <div className="box">
                    <div className="container">

                        <div className="logoBox">
                            <img className="logo" src={logo} alt="logo"/>
                        </div>


                        <div id="login-register-box">

                            <div id="formContainer">

                                <div className="nav-buttons">
                                    {/*<button id="loginBtn" onClick={logForm} className="active">Login</button>*/}

                                    {/*<button id="registerBtn" onClick={regForm}>Register</button>*/}


                                    <button id="loginBtn" className="active">Login</button>
                                    <button id="registerBtn">Register</button>


                                </div>

                                <div id="form-group">

                                    <form action id="loginForm">

                                        <form onSubmit={this.doLogin}>
                                            {
                                                this.props.errorMessage && (
                                                    <Alert className="alert-sm widget-middle-overflow rounded-0"
                                                           color="danger">
                                                        {this.props.errorMessage}
                                                    </Alert>
                                                )
                                            }

                                            {/*for email*/}
                                            <FormGroup className="mt">

                                                <Label for="email">Please enter your Email / Phone Number hear </Label>
                                                <InputGroup className="input-group-no-border">
                                                    <InputGroupAddon addonType="prepend">
                                                        <InputGroupText>
                                                            <i className="la la-user text-white"/>
                                                        </InputGroupText>
                                                    </InputGroupAddon>
                                                    <Input id="email" className="input-transparent pl-3"
                                                           value={this.state.loginEmail}
                                                           onChange={this.loginEmail} type="email"
                                                           required name="email" placeholder="Email / Phone Number"/>
                                                </InputGroup>
                                            </FormGroup>

                                            {/*for password*/}
                                            <FormGroup>
                                                <Label for="password">Password</Label>
                                                <InputGroup className="input-group-no-border">
                                                    <InputGroupAddon addonType="prepend">
                                                        <InputGroupText>
                                                            <i className="la la-lock text-white"/>
                                                        </InputGroupText>
                                                    </InputGroupAddon>
                                                    <Input id="password" className="input-transparent pl-3"
                                                           value={this.state.loginPassword}
                                                           onChange={this.changePassword} type="password"
                                                           required name="password" placeholder="Password"/>
                                                </InputGroup>
                                            </FormGroup>


                                            <div className="bg-widget auth-widget-footer">

                                                {/*for login Button*/}

                                                <div className="auth-btn-container">

                                                    <Button className="auth-btn" type="submit">
                                                        <span className="auth-btn-circle" style={{marginRight: 8}}><i
                                                            className="la la-caret-right"/>
                                                        </span>
                                                        {this.props.isFetching ? 'Loading...' : 'Login..'}
                                                    </Button>

                                                </div>

                                                <div className="social-buttons-container">


                                                    <Button className="social-button">
                                                        <div className="google-btn">
                                                            <div className="google-icon-wrapper">
                                                                <img className="google-icon" src={google}/>
                                                            </div>
                                                            <p className="btn-text"><b>Sign in with google</b></p>
                                                        </div>
                                                    </Button>


                                                    <Button className="social-button">
                                                        <div className="facebook-btn">
                                                            <div className="facebook-icon-wrapper">
                                                                <img className="facebook-icon" src={facebook}/>
                                                            </div>
                                                            <p className="btn-text"><b>Sign in with facebook</b></p>
                                                        </div>
                                                    </Button>


                                                </div>

                                            </div>
                                        </form>


                                    </form>
                                    <form action id="registerForm">
                                        <form onSubmit={this.doRegister}>
                                            {
                                                this.props.errorMessage && (
                                                    <Alert className="alert-sm widget-middle-overflow rounded-0"
                                                           color="danger">
                                                        {this.props.errorMessage}
                                                    </Alert>
                                                )
                                            }
                                            <FormGroup className="mt">
                                                <Label for="firstname">First Name</Label>
                                                <InputGroup className="input-group-no-border">
                                                    <InputGroupAddon addonType="prepend">
                                                        <InputGroupText>
                                                            <i className="la la-user text-white"/>
                                                        </InputGroupText>
                                                    </InputGroupAddon>
                                                    <Input id="firstname" className="input-transparent pl-3"
                                                           value={this.state.firstName}
                                                           onChange={this.firstName} type="firstname"
                                                           required name="firstname" placeholder="First Name"/>
                                                </InputGroup>
                                            </FormGroup>


                                            <FormGroup className="mt">
                                                <Label for="lastname">Last Name</Label>
                                                <InputGroup className="input-group-no-border">
                                                    <InputGroupAddon addonType="prepend">
                                                        <InputGroupText>
                                                            <i className="la la-user text-white"/>
                                                        </InputGroupText>
                                                    </InputGroupAddon>
                                                    <Input id="lastname" className="input-transparent pl-3"
                                                           value={this.state.lastName}
                                                           onChange={this.lastName} type="lastname"
                                                           required name="lastname" placeholder="Last Name"/>
                                                </InputGroup>
                                            </FormGroup>


                                            <FormGroup className="mt">
                                                <Label for="email">Email</Label>
                                                <InputGroup className="input-group-no-border">
                                                    <InputGroupAddon addonType="prepend">
                                                        <InputGroupText>
                                                            <i className="fa fa-envelope-o text-white"/>
                                                        </InputGroupText>
                                                    </InputGroupAddon>
                                                    <Input id="email" className="input-transparent pl-3"
                                                           value={this.state.regEmail}
                                                           onChange={this.regEmail} type="email"
                                                           required name="email" placeholder="Email"/>
                                                </InputGroup>
                                            </FormGroup>


                                            <FormGroup className="mt">
                                                <Label for="phoneNumber">Phone Number</Label>
                                                <InputGroup className="input-group-no-border">
                                                    <InputGroupAddon addonType="prepend">
                                                        <InputGroupText>
                                                            <i className="fa fa-phone text-white"/>
                                                        </InputGroupText>
                                                    </InputGroupAddon>
                                                    <Input id="phoneNumber" className="input-transparent pl-3"
                                                           value={this.state.phoneNumber}
                                                           onChange={this.phoneNumber} type="tel"
                                                           required name="phoneNumber" placeholder="Phone Number"/>
                                                </InputGroup>
                                            </FormGroup>


                                            <FormGroup>
                                                <Label for="password">Password</Label>
                                                <InputGroup className="input-group-no-border">
                                                    <InputGroupAddon addonType="prepend">
                                                        <InputGroupText>
                                                            <i className="la la-lock text-white"/>
                                                        </InputGroupText>
                                                    </InputGroupAddon>
                                                    <Input id="password" className="input-transparent pl-3"
                                                           value={this.state.password}
                                                           onChange={this.changePassword} type="password"
                                                           required name="password" placeholder="Password"/>
                                                </InputGroup>
                                            </FormGroup>
                                            <FormGroup>
                                                <Label for="confirmPassword">Confirm Password</Label>
                                                <InputGroup className="input-group-no-border">
                                                    <InputGroupAddon addonType="prepend">
                                                        <InputGroupText>
                                                            <i className="la la-lock text-white"/>
                                                        </InputGroupText>
                                                    </InputGroupAddon>
                                                    <Input id="confirmPassword" className="input-transparent pl-3"
                                                           value={this.state.confirmPassword}
                                                           onChange={this.changeConfirmPassword}
                                                           onBlur={this.checkPassword}
                                                           type="password"
                                                           required name="confirmPassword" placeholder="Confirm"/>
                                                </InputGroup>
                                            </FormGroup>
                                        </form>

                                        <div className="bg-widget auth-widget-footer">
                                            <div className="auth-btn-container">

                                                <Button className="auth-btn" type="submit">
                                                        <span className="auth-btn-circle" style={{marginRight: 8}}><i
                                                            className="la la-caret-right"/>
                                                        </span>
                                                    {this.props.isFetching ? 'Loading...' : 'Request Now..'}
                                                </Button>

                                            </div>

                                            <div className="social-buttons-container">

                                                <Button className="social-button">
                                                    <div className="google-btn">
                                                        <div className="google-icon-wrapper">
                                                            <img className="google-icon" src={google}/>
                                                        </div>
                                                        <p className="btn-text"><b>Sign in with google</b></p>
                                                    </div>
                                                </Button>


                                                <Button className="social-button">
                                                    <div className="facebook-btn">
                                                        <div className="facebook-icon-wrapper">
                                                            <img className="facebook-icon" src={facebook}/>
                                                        </div>
                                                        <p className="btn-text"><b>Sign in with facebook</b></p>
                                                    </div>
                                                </Button>

                                            </div>

                                        </div>
                                    </form>
                                </div>
                            </div>


                            <div id="forgot">
                                <Link className="d-block text-center mb-4" to="forgotPassword">forgot password?</Link>
                            </div>

                            <div className="chkBox">
                                <p className="forget">I accept the <a href="#">End-user License Agreement</a></p>
                                <label>
                                    <input type="checkbox"/>
                                    <span/>
                                    <i className="indicator"/>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>


                {/*This is my code end line*/}


                <footer className="auth-footer">
                    {new Date().getFullYear()} &copy;<a href="https://plugev.lk" rel="noopener noreferrer"
                                                        target="_blank"> Plug-EV </a> By- Bee-9X Innovations Lab
                </footer>
            </div>
        );
    }
}

function mapStateToProps(state) {
    return {
        isFetching: state.auth.isFetching,
        isAuthenticated: state.auth.isAuthenticated,
        errorMessage: state.auth.errorMessage,
    };
}

export default withRouter(connect(mapStateToProps)(Login));


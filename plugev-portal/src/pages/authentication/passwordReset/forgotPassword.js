import React from 'react';
import PropTypes from 'prop-types';
import { Link, Redirect, withRouter } from 'react-router-dom';
import { connect } from 'react-redux';
import {
    Alert,
    Button,
    Container,
    FormGroup,
    Input,
    InputGroup,
    InputGroupAddon,
    InputGroupText,
    Label
} from 'reactstrap';
import Widget from '../../../components/Widget';
import { PasswordResetError, userPasswordReset } from '../../../actions/passwordReset';
import Login from '../login';

class ForgotPassword extends React.Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);

        this.state = {
            email: '',
            newPassword: '',
            confirmNewPassword: ''
        };

        this.doChangePassword = this.doChangePassword.bind(this);
        this.changeEmail = this.changeEmail.bind(this);
        this.newPassword = this.newPassword.bind(this);
        this.confirmNewPassword = this.confirmNewPassword.bind(this);
        this.checkPassword = this.checkPassword.bind(this);
        this.isPasswordValid = this.isPasswordValid.bind(this);
    }

    changeEmail(event) {
        this.setState({ email: event.target.value });
    }

    newPassword(event) {
        this.setState({ newPassword: event.target.value });
    }

    confirmNewPassword(event) {
        this.setState({ confirmNewPassword: event.target.value });
    }

    checkPassword() {
        if (!this.isPasswordValid()) {
            if (!this.state.newPassword) {
                this.props.dispatch(PasswordResetError("Password field is empty"));
            } else {
                this.props.dispatch(PasswordResetError("Passwords are not equal"));
            }
            setTimeout(() => {
                this.props.dispatch(PasswordResetError());
            }, 3 * 1000)
        }
    }

    isPasswordValid() {
        return this.state.newPassword && this.state.newPassword === this.state.confirmNewPassword;
    }

    doChangePassword(e) {
        e.preventDefault();
        if (!this.isPasswordValid()) {
            this.checkPassword();
        } else {
            this.props.dispatch(userPasswordReset({
                creds: {
                    email: this.state.email,
                    newPassword: this.state.newPassword
                },
                history: this.props.history
            }));
        }
    }

    render() {
        const { from } = this.props.location.state || { from: { pathname: '/app' } }; // eslint-disable-line

        // cant access login page while logged in
        if (Login.isAuthenticated(JSON.parse(localStorage.getItem('authenticated')))) {
            return (
                <Redirect to={from} />
            );
        }

        return (
            <div className="auth-page">
                <Container>
                    <Widget className="widget-auth mx-auto" title={<h3 className="mt-0">OOPS..!
                        <br />I cant remembered my password</h3>}>
                        <p className="widget-auth-info">
                            Can i have get new password??
                        </p>

                        <form onSubmit={this.doChangePassword}>
                            {
                                this.props.errorMessage && (
                                    <Alert className="alert-sm widget-middle-overflow rounded-0" color="danger">
                                        {this.props.errorMessage}
                                    </Alert>
                                )
                            }
                            <FormGroup className="mt">
                                <Label for="email">Email</Label>
                                <InputGroup className="input-group-no-border">
                                    <InputGroupAddon addonType="prepend">
                                        <InputGroupText>
                                            <i className="la la-user text-white" />
                                        </InputGroupText>
                                    </InputGroupAddon>
                                    <Input id="email" className="input-transparent pl-3" value={this.state.email}
                                           onChange={this.changeEmail} type="email"
                                           required name="email" placeholder="Email" />
                                </InputGroup>
                            </FormGroup>
                            <FormGroup>
                                <Label for="password">Please enter new Password</Label>
                                <InputGroup className="input-group-no-border">
                                    <InputGroupAddon addonType="prepend">
                                        <InputGroupText>
                                            <i className="la la-lock text-white" />
                                        </InputGroupText>
                                    </InputGroupAddon>
                                    <Input id="password" className="input-transparent pl-3"
                                           value={this.state.newPassword}
                                           onChange={this.newPassword} type="password"
                                           required name="newPassword" placeholder="Password" />
                                </InputGroup>
                            </FormGroup>
                            <FormGroup>
                                <Label for="confirmPassword">Confirm that</Label>
                                <InputGroup className="input-group-no-border">
                                    <InputGroupAddon addonType="prepend">
                                        <InputGroupText>
                                            <i className="la la-lock text-white" />
                                        </InputGroupText>
                                    </InputGroupAddon>
                                    <Input id="confirmPassword" className="input-transparent pl-3"
                                           value={this.state.confirmNewPassword}
                                           onChange={this.confirmNewPassword} onBlur={this.checkPassword}
                                           type="password"
                                           required name="confirmNewPassword" placeholder="Confirm" />
                                </InputGroup>
                            </FormGroup>

                            <div className="bg-widget auth-widget-footer">
                                <div className="auth-btn-container">

                                    <Button className="auth-btn" type="submit">
                                        <span className="auth-btn-circle" style={{ marginRight: 8 }}><i
                                            className="la la-caret-right" />
                                        </span>
                                        {this.props.isFetching ? 'Loading...' : 'Request Now..'}
                                    </Button>

                                    <p className="widget-auth-info mt-4">
                                        Wait Wait..!
                                        <br />i remembered that password.. Login now!
                                    </p>
                                    <Link className="d-block text-center mb-4" to="login">Enter the account</Link>
                                </div>
                            </div>
                        </form>
                    </Widget>


                </Container>
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
        isFetching: state.register.isFetching,
        errorMessage: state.register.errorMessage,
    };
}

export default withRouter(connect(mapStateToProps)(ForgotPassword));


import React from "react";
import {Alert, Col, Button, FormGroup, Input, InputGroup, InputGroupAddon, InputGroupText, Label,} from "reactstrap";

import s from "../../pages/tables/static/Static.module.scss";
import Widget from "../../components/Widget";
import PropTypes from "prop-types";
import {PasswordResetError, userPasswordReset} from "../../actions/passwordReset";

class ChangePasswordComponent extends React.Component {


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
        this.setState({email: event.target.value});
    }

    newPassword(event) {
        this.setState({newPassword: event.target.value});
    }

    confirmNewPassword(event) {
        this.setState({confirmNewPassword: event.target.value});
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
        return (
            <div className={s.root}>


                <Col lg={12} md={12} sm={12}>
                    <Widget
                        title={
                            <h5>
                                User - <span className="fw-semi-bold">Password</span>
                            </h5>
                        }
                        refresh
                        collapse
                        close
                    >

                        <div>
                            <h3>
                                Change <span className="fw-semi-bold">Password</span>
                            </h3>
                            <p>
                                Add any non-bordered .table within a widget for a seamless
                                design. Awesome look for no cost. Just wrap the table with
                                simple css class <code>.widget-table-overflow</code> inside of
                                widget
                            </p>
                        </div>

                        <div>

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
                                                <i className="la la-user text-white"/>
                                            </InputGroupText>
                                        </InputGroupAddon>
                                        <Input id="email" className="input-transparent pl-3" value={this.state.email}
                                               onChange={this.changeEmail} type="email"
                                               required name="email" placeholder="Email"/>
                                    </InputGroup>
                                </FormGroup>

                                <FormGroup>
                                    <Label for="password">Please enter Current Password</Label>
                                    <InputGroup className="input-group-no-border">
                                        <InputGroupAddon addonType="prepend">
                                            <InputGroupText>
                                                <i className="la la-lock text-white"/>
                                            </InputGroupText>
                                        </InputGroupAddon>
                                        <Input id="password" className="input-transparent pl-3"
                                               value={this.state.newPassword}
                                               onChange={this.newPassword} type="password"
                                               required name="currentPassword" placeholder="Current Password"/>
                                    </InputGroup>
                                </FormGroup>

                                <FormGroup>
                                    <Label for="password">Please enter new Password</Label>
                                    <InputGroup className="input-group-no-border">
                                        <InputGroupAddon addonType="prepend">
                                            <InputGroupText>
                                                <i className="la la-lock text-white"/>
                                            </InputGroupText>
                                        </InputGroupAddon>
                                        <Input id="password" className="input-transparent pl-3"
                                               value={this.state.newPassword}
                                               onChange={this.newPassword} type="password"
                                               required name="newPassword" placeholder="New Password"/>
                                    </InputGroup>
                                </FormGroup>
                                <FormGroup>
                                    <Label for="confirmPassword">Confirm that</Label>
                                    <InputGroup className="input-group-no-border">
                                        <InputGroupAddon addonType="prepend">
                                            <InputGroupText>
                                                <i className="la la-lock text-white"/>
                                            </InputGroupText>
                                        </InputGroupAddon>
                                        <Input id="confirmPassword" className="input-transparent pl-3"
                                               value={this.state.confirmNewPassword}
                                               onChange={this.confirmNewPassword} onBlur={this.checkPassword}
                                               type="password"
                                               required name="confirmNewPassword" placeholder="Confirm New Password"/>
                                    </InputGroup>
                                </FormGroup>

                                <div className="bg-widget auth-widget-footer">
                                    <div className="auth-btn-container">

                                        <button type="button" className="btn btn-outline-warning">
                                            Change Password.. <i className="la la-lock text-white"/>
                                        </button>

                                        <button type="button" className="btn btn-outline-primary">
                                            Cancel.. <i className="fa fa-ban text-white"/>
                                        </button>

                                    </div>
                                </div>
                            </form>

                        </div>


                    </Widget>
                </Col>

            </div>
        );
    }
}

export default ChangePasswordComponent;

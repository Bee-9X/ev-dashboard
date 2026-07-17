import React from "react";
import {Alert, Button, Col, FormGroup, Input, InputGroup, InputGroupAddon, InputGroupText, Label,} from "reactstrap";

import s from "../../pages/tables/static/Static.module.scss";
import Widget from "../../components/Widget";
import PropTypes from "prop-types";
import "./UserStyles.css";
import {PasswordResetError, userPasswordReset} from "../../actions/passwordReset";

class EditProfileComponent extends React.Component {


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

    componentDidMount() {
        const inpFile = document.getElementById("inpFile");
        const previewContainer = document.getElementById("img_preview");
        const previewImage = previewContainer.querySelector(".img");
        const previewDefaultText = previewContainer.querySelector(".preview_txt");


        inpFile.addEventListener("change", function () {
            const file = this.files[0];

            if (file) {
                const reader = new FileReader();

                previewDefaultText.style.display = "none";
                previewImage.style.display = "block";

                reader.addEventListener("load", function () {
                    previewImage.setAttribute("src", this.result);
                });

                reader.readAsDataURL(file);
            } else {
                previewDefaultText.style.display = "null";
                previewImage.style.display = "null";
                previewImage.setAttribute("src", "");
            }

        });
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
                                User - <span className="fw-semi-bold">Profile</span>
                            </h5>
                        }
                        refresh
                        collapse
                        close
                    >

                        <div>
                            <h3>
                                Edit <span className="fw-semi-bold">Profile</span>
                            </h3>
                            <p>
                                Add any non-bordered .table within a widget for a seamless
                                design. Awesome look for no cost. Just wrap the table with
                                simple css class <code>.widget-table-overflow</code> inside of
                                widget
                            </p>
                        </div>

                        <div className="passwordContainer">

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
                            </form>
                        </div>

                        <div className="file-upload">

                            <div className="wrapper">
                                {/* Custom File Upload Button */}
                                <input type="file" name="inpFile" id="inpFile" accept="image/*"/>
                                <label className="upload_btn" htmlFor="inpFile">
                                    Add Avatar.. <i className="fa fa-edit text-light"/>
                                </label>
                                {/* Image Preview */}
                                <div className="img_preview" id="img_preview">
                                    <img src="" alt="Image Preview" className="img"/>
                                    <span className="preview_txt"><h3>Image Preview</h3></span>
                                </div>
                            </div>

                        </div>

                        <div className="clearfix">
                            <div className="buttonSet">

                                <Button color="btn btn-success" className="mr-2" size="md">
                                    Save.. <i className="fa fa-floppy-o text-white"/>
                                </Button>

                                <Button color="default" className="mr-2" size="md">
                                    Reset.. <i className="fa fa-refresh text-light"/>
                                </Button>

                                <Button color="default" className="mr-2" size="md">
                                    Cancel.. <i className="fa fa-ban text-white"/>
                                </Button>

                            </div>
                        </div>

                    </Widget>
                </Col>

            </div>
        );
    }
}

export default EditProfileComponent;

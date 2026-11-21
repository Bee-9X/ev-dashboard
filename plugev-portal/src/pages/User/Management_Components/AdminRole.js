import React from "react";
import {Button, Table,} from "reactstrap";

import s from "../../tables/static/Static.module.scss";
import ss from "../../dashboard/Dashboard.module.scss";
import { Link } from "react-router-dom";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faUsersCog} from "@fortawesome/free-solid-svg-icons";


class AdminRoleComponent extends React.Component {

    render() {

        return (
            <div className={s.root}>
                {/*______________________________________For search____________________________*/}
                <div className="input-group mt">
                    <input
                        type="text"
                        className="form-control bg-custom-dark border-0"
                        placeholder="Search"
                    />
                    <span className="input-group-btn">
                        <button
                            type="submit"
                            className={`btn btn-subtle-blue ${ss.searchBtn}`}
                        >
                            <i className="fa fa-search text-light" />
                        </button>
                    </span>
                </div>

                {/*______________________________________For Table____________________________*/}

                <div className={`widget-table-overflow ${s.overFlow}`}>

                    <Table className="table-striped table-lg mt-lg mb-0">
                        <thead>
                        <tr>
                            <th>User identity</th>
                            <th className="text-right">Avatar</th>
                            <th className="text-right">Admin Role</th>
                            <th className="text-right">Name</th>
                            <th className="text-right">Phone No</th>
                            <th className="text-right">Email</th>
                            <th className="text-right">Disabled</th>
                            <th className="text-right">Action</th>
                        </tr>
                        </thead>

                        <tbody>


                        <tr>
                            <th> 0000001</th>
                            <th className="text-right"> </th>
                            <th className="text-right">Super Admin</th>
                            <th className="text-right">Madhusara Ariyawansha</th>
                            <th className="text-right">0714567899</th>
                            <th className="text-right">abc@cdf.com</th>
                            <th className="text-right">No</th>
                            <th className="text-right">

                                <div className="clearfix">
                                    <div className="buttonSet">

                                        <Button color="success" className="mr-2" size="sm">
                                            Edit...<i className="fa fa-edit"/>
                                        </Button>
                                    </div>
                                </div>

                                <div className="clearfix">
                                    <div className="buttonSet">

                                        <Button color="primary" className="mr-2" size="sm">
                                            View..<i className="fa fa-eye"/>
                                        </Button>
                                    </div>
                                </div>

                                {/*<div className="clearfix">*/}
                                {/*    <div className="buttonSet">*/}

                                {/*        <Button color="warning" className="mr-2" size="sm">*/}
                                {/*            Block....<i className="fa fa-remove"/>*/}
                                {/*        </Button>*/}
                                {/*    </div>*/}
                                {/*</div>*/}

                                {/*<div className="clearfix">*/}
                                {/*    <div className="buttonSet">*/}

                                {/*        <Button color="danger" className="mr-2" size="sm">*/}
                                {/*            Delete. <i className="fa fa-trash"/>*/}
                                {/*        </Button>*/}
                                {/*    </div>*/}
                                {/*</div>*/}

                            </th>
                        </tr>

                        </tbody>
                    </Table>

                </div>
                <br/>
                <div className="clearfix">

                    <div className="float-md-right">

                        <button type="button" className="btn btn-outline-success text-white">
                            Create New Admin.. <FontAwesomeIcon icon={faUsersCog}> </FontAwesomeIcon>
                        </button>

                    </div>
                </div>
            </div>
        );
    }
}

export default AdminRoleComponent;

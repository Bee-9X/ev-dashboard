import React from "react";
import './stationsDataTableStyles.css';
import s from "../../tables/static/Static.module.scss";
import { Link, Redirect, withRouter } from 'react-router-dom';
import { Badge, Input, Label, Table } from "reactstrap";


class TerminalsComponent extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            checkboxes1: [false, false, true, true, true],
        };
        this.checkAll = this.checkAll.bind(this);

    }


    checkAll(ev, checkbox) {
        const checkboxArr = new Array(this.state[checkbox].length).fill(
            ev.target.checked
        );
        this.setState({
            [checkbox]: checkboxArr,
        });
    }

    changeCheck(ev, checkbox, id) {
        //eslint-disable-next-line
        this.state[checkbox][id] = ev.target.checked;
        if (!ev.target.checked) {
            //eslint-disable-next-line
            this.state[checkbox][0] = false;
        }
        this.setState({
            [checkbox]: this.state[checkbox],
        });
    }


    render() {
        return (
            <div>
                <h3>
                    Charging Station's <span className="fw-semi-bold">Live Information</span>
                </h3>

                <p>
                    Each row is highlighted. You will never lost there. Just{" "}
                    <code>.table-striped</code> it.
                </p>


                <div className="terminalType">
                    <div className={`widget-table-overflow ${s.overFlow}`}>
                        <Table className="table-striped">
                            <thead>
                            <tr>
                                <th>
                                    <div className="abc-checkbox">
                                        <Input
                                            id="checkbox1"
                                            type="checkbox"
                                            checked={this.state.checkboxes1[0]}
                                            onChange={(event) =>
                                                this.checkAll(event, "checkboxes1")
                                            }
                                        />
                                        <Label for="checkbox1" />
                                    </div>
                                </th>
                                <th>Connector Type</th>
                                {/*<th>Terminal Number</th>*/}
                                <th>Current Status</th>
                            </tr>
                            </thead>
                            <tbody>
                            <tr>
                                <td>
                                    <div className="abc-checkbox">
                                        <Input
                                            id="checkbox2"
                                            type="checkbox"
                                            checked={this.state.checkboxes1[1]}
                                            onChange={(event) =>
                                                this.changeCheck(event, "checkboxes1", 1)
                                            }
                                        />
                                        <Label for="checkbox2" />
                                    </div>
                                </td>

                                <td>CHAdeMo</td>
                                {/*<td>00001</td>*/}
                                <td>
                                    <Badge color="success">Online</Badge>
                                </td>
                            </tr>

                            <tr>
                                <td>
                                    <div className="abc-checkbox">
                                        <Input
                                            id="checkbox3"
                                            type="checkbox"
                                            checked={this.state.checkboxes1[2]}
                                            onChange={(event) =>
                                                this.changeCheck(event, "checkboxes1", 2)
                                            }
                                        />
                                        <Label for="checkbox3" />
                                    </div>
                                </td>
                                <td>
                                    CCS Type 1{" "}
                                    <Badge color="warning" className="ml-2">
                                        ALERT!
                                    </Badge>
                                </td>
                                {/*<td>00002</td>*/}
                                <td>
                                        <span className="text-secondary badge badge-gray">
                                            Offline
                                        </span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <div className="abc-checkbox">
                                        <Input
                                            id="checkbox4"
                                            type="checkbox"
                                            checked={this.state.checkboxes1[3]}
                                            onChange={(event) =>
                                                this.changeCheck(event, "checkboxes1", 3)
                                            }
                                        />
                                        <Label for="checkbox4" />
                                    </div>
                                </td>
                                <td>CCS Type2</td>
                                {/*<td>00003</td>*/}
                                <td>
                                    <Badge color="danger">Charging</Badge>
                                </td>
                            </tr>

                            <tr>
                                <td>
                                    <div className="abc-checkbox">
                                        <Input
                                            id="checkbox5"
                                            type="checkbox"
                                            checked={this.state.checkboxes1[4]}
                                            onChange={(event) =>
                                                this.changeCheck(event, "checkboxes1", 4)
                                            }
                                        />
                                        <Label for="checkbox4" />
                                    </div>
                                </td>
                                <td>J1772</td>
                                {/*<td>00003</td>*/}
                                <td>
                                    <Badge color="danger">Charging</Badge>
                                </td>
                            </tr>

                            </tbody>
                        </Table>
                    </div>
                </div>


                <br />
                <br />
                <h3>
                    Terminal's <span className="fw-semi-bold">Live Information here..!</span>
                </h3>
                <p>
                    {"Trace only what's really important. "}
                    <code>.table-hover</code> is made for it.
                </p>


                <div className="stationInfo">

                    <div className={s.overFlow}>
                        <Table className="table-hover">
                            <thead>
                            <tr>
                                <th>#</th>
                                <th>Station Name</th>
                                <th>Connector Type</th>
                                <th>Terminal No</th>
                                <th>CURRENT Status</th>
                            </tr>
                            </thead>
                            {/* eslint-disable */}
                            <tbody>
                            <tr>
                                <td>1</td>
                                <td><Link to="/app/charging stations/Terminal Records"><h7 className="fw-bold"> Kottawa kinro </h7></Link></td>
                                <td>CHAdeMo</td>
                                <td>001</td>
                                <td>
                                    <Badge color="gray" className="text-secondary" pill>
                                        Offline
                                    </Badge>
                                </td>
                            </tr>
                            <tr>
                                <td>2</td>
                                <td><a href="#"> <h7 className="fw-bold"> Kottawa kinro </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>002</td>
                                <td>
                                    <Badge color="gray" className="text-secondary" pill>
                                        Offline
                                    </Badge>
                                </td>
                            </tr>
                            <tr>
                                <td>3</td>
                                <td><a href="#"> <h7 className="fw-bold"> Kottawa kinro </h7> </a></td>
                                <td>CCS type1</td>
                                <td>003</td>
                                <td>
                                    <Badge color="primary" className="text-secondary" pill>
                                        New
                                    </Badge>
                                </td>
                            </tr>
                            <tr>
                                <td>4</td>
                                <td><a href="#"> <h7 className="fw-bold"> Kadawatha </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>001</td>
                                <td>
                                    <Badge color="success" className="text-secondary" pill>
                                        Online
                                    </Badge>
                                </td>
                            </tr>

                            <tr>
                                <td>5</td>
                                <td><a href="#"> <h7 className="fw-bold"> Kurunegala </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>001</td>
                                <td>
                                    <Badge color="success" className="text-secondary" pill>
                                        Online
                                    </Badge>
                                </td>
                            </tr>


                            <tr>
                                <td>6</td>
                                <td><a href="#"> <h7 className="fw-bold"> Kurunegala </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>002</td>
                                <td>
                                    <Badge color="success" className="text-secondary" pill>
                                        Online
                                    </Badge>
                                </td>
                            </tr>


                            <tr>
                                <td>7</td>
                                <td><a href="#"> <h7 className="fw-bold"> Dambulla </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>001</td>
                                <td>
                                    <Badge color="success" className="text-secondary" pill>
                                        Online
                                    </Badge>
                                </td>
                            </tr>


                            <tr>
                                <td>8</td>
                                <td><a href="#"> <h7 className="fw-bold"> Pilimathalawa </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>001</td>
                                <td>
                                    <Badge color="success" className="text-secondary" pill>
                                        Online
                                    </Badge>
                                </td>
                            </tr>


                            <tr>
                                <td>9</td>
                                <td><a href="#"> <h7 className="fw-bold"> Ja-Ela </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>001</td>
                                <td>
                                    <Badge color="success" className="text-secondary" pill>
                                        Online
                                    </Badge>
                                </td>
                            </tr>


                            <tr>
                                <td>10</td>
                                <td><a href="#"> <h7 className="fw-bold"> Nigombo </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>001</td>
                                <td>
                                    <Badge color="success" className="text-secondary" pill>
                                        Online
                                    </Badge>
                                </td>
                            </tr>


                            <tr>
                                <td>11</td>
                                <td><a href="#"> <h7 className="fw-bold"> Welisara </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>001</td>
                                <td>
                                    <Badge color="success" className="text-secondary" pill>
                                        Online
                                    </Badge>
                                </td>
                            </tr>


                            <tr>
                                <td>12</td>
                                <td><a href="#"> <h7 className="fw-bold"> Galle </h7> </a></td>
                                <td>CHAdeMo</td>
                                <td>001</td>
                                <td>
                                    <Badge color="success" className="text-secondary" pill>
                                        Online
                                    </Badge>
                                </td>
                            </tr>


                            </tbody>
                            {/* eslint-enable */}


                        </Table>
                    </div>
                </div>
            </div>
        );
    }
}

export default withRouter(TerminalsComponent);
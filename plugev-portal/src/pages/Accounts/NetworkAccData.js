import React from "react";
import {
    Button,
    Col,
    Input,
    InputGroup,
    InputGroupAddon,
    InputGroupText,
    Label,
    Row,
    Table
} from "reactstrap";

import {Sparklines, SparklinesBars} from "react-sparklines";
import s from "../tables/static/Static.module.scss";
import Widget from "../../components/Widget";
import {Link} from "react-router-dom";

import BarChartComponent from "./BarChart/BarChart";
import PieChartComponent from "./PieChart/PieChart";
import LineChartComponent from "./LineChart/LineChart";

class NetworkAccData extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            checkboxes1: [true, false, false, false, false],
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
            <div className={s.root}>


                <Col lg={12} md={12} sm={12}>
                    <Widget
                        title={
                            <h5>
                                Current <span className="fw-semi-bold">Status</span>
                            </h5>
                        }
                        refresh
                        collapse
                        close
                    >

                        <div>
                            <h3>
                                Chargers Stations <span className="fw-semi-bold">Live Information</span>
                            </h3>
                            <p>
                                Add any non-bordered .table within a widget for a seamless
                                design. Awesome look for no cost. Just wrap the table with
                                simple css class <code>.widget-table-overflow</code> inside of
                                widget
                            </p>
                        </div>


                        <Row>

                            <Col lg={7} xs={12}>
                                <Widget
                                    title={
                                        <h5>
                                            Charging Progress in <span
                                            className="fw-semi-bold">This Week (kWh)</span>
                                        </h5>
                                    }

                                    collapse
                                    close
                                >
                                    <BarChartComponent/>

                                </Widget>
                            </Col>


                            <Col lg={5} xs={12}>
                                <Widget
                                    title={
                                        <h5>
                                            Charging Progress in <span
                                            className="fw-semi-bold">This Week (kWh)</span>
                                        </h5>
                                    }

                                    collapse
                                    close
                                >
                                    <PieChartComponent/>

                                </Widget>
                            </Col>


                            <Col lg={3} md={12} sm={12}>
                                <Widget
                                    title={
                                        <h5>
                                            Selection <span className="fw-semi-bold">Aria</span>
                                        </h5>
                                    }

                                    collapse
                                    close
                                >
                                    <div className="dateInputGroup">
                                        <div className="checkBoxesAria">

                                            <div className="abc-checkbox">
                                                <Input
                                                    id="checkbox1"
                                                    type="checkbox"
                                                    checked={this.state.checkboxes1[0]}
                                                    onChange={(event) =>
                                                        this.changeCheck(event, "checkboxes1", 0)
                                                    }
                                                />
                                                <Label for="checkbox1"> Today </Label>
                                            </div>


                                            <div className="abc-checkbox">
                                                <Input
                                                    id="checkbox2"
                                                    type="checkbox"
                                                    checked={this.state.checkboxes1[1]}
                                                    onChange={(event) =>
                                                        this.changeCheck(event, "checkboxes1", 1)
                                                    }
                                                />
                                                <Label for="checkbox2"> This Week </Label>
                                            </div>


                                            <div className="abc-checkbox">
                                                <Input
                                                    id="checkbox3"
                                                    type="checkbox"
                                                    checked={this.state.checkboxes1[2]}
                                                    onChange={(event) =>
                                                        this.changeCheck(event, "checkboxes1", 2)
                                                    }
                                                />
                                                <Label for="checkbox3"> This Month </Label>
                                            </div>

                                            <div className="abc-checkbox">
                                                <Input
                                                    id="checkbox4"
                                                    type="checkbox"
                                                    checked={this.state.checkboxes1[3]}
                                                    onChange={(event) =>
                                                        this.changeCheck(event, "checkboxes1", 3)
                                                    }
                                                />
                                                <Label for="checkbox4"> This year </Label>
                                            </div>


                                            <div className="abc-checkbox">
                                                <Input
                                                    id="checkbox5"
                                                    type="checkbox"
                                                    checked={this.state.checkboxes1[4]}
                                                    onChange={(event) =>
                                                        this.changeCheck(event, "checkboxes1", 4)
                                                    }
                                                />
                                                <Label for="checkbox5"> Date Range </Label>
                                            </div>


                                        </div>

                                        <br/>

                                        <Label for="date">From </Label>
                                        <InputGroup className="input-group-no-border">
                                            <InputGroupAddon addonType="prepend">
                                                <InputGroupText>
                                                    <i className=" la la-calendar text-white"/>
                                                </InputGroupText>
                                            </InputGroupAddon>
                                            <Input id="date" className="input-transparent pl-3"
                                                // value={this.state.loginEmail}
                                                // onChange={this.loginEmail}
                                                   type="date"
                                                   required name="date" placeholder="from date"/>
                                        </InputGroup>


                                        <Label for="date">To</Label>
                                        <InputGroup className="input-group-no-border">
                                            <InputGroupAddon addonType="prepend">
                                                <InputGroupText>
                                                    <i className="la la-calendar text-white"/>
                                                </InputGroupText>
                                            </InputGroupAddon>
                                            <Input id="date" className="input-transparent pl-3"
                                                // value={this.state.loginEmail}
                                                // onChange={this.loginEmail}
                                                   type="date"
                                                   required name="date" placeholder="from date"/>
                                        </InputGroup>

                                        <br/>
                                        <div className="clearfix">
                                            <div className="-float-center">
                                                <Button color="default" className="mr-2" size="md">
                                                    Search.. <i className="fa fa-search text-light"/>
                                                </Button>
                                            </div>
                                        </div>

                                    </div>

                                </Widget>
                            </Col>

                            <Col lg={3} md={12} sm={12}>
                                <Widget
                                    title={
                                        <h5>
                                            Charging <span className="fw-semi-bold">Information</span>
                                        </h5>
                                    }

                                    collapse
                                    close
                                >

                                    <div className="chargingInfoBox">

                                        <h6>Admin account Unit:</h6>
                                        <h6>User account Unit:</h6>
                                        <h6>Total kWh:</h6>

                                        <br/>

                                        <h6>Admin amount:</h6>
                                        <h6>User amount:</h6>
                                        <h6>Total amount:</h6>

                                        <br/>

                                        <h6>System maintainers amount:</h6>
                                        <br/>
                                        <br/>
                                        <br/>
                                        <br/>
                                        <br/>
                                        <br/>
                                        <br/>
                                        <br/>

                                    </div>

                                </Widget>
                            </Col>


                            <Col lg={6} xs={12}>
                                <Widget
                                    title={
                                        <h5>
                                            Profile <span
                                            className="fw-semi-bold">Information</span>
                                        </h5>
                                    }

                                    collapse
                                    close
                                >

                                    <div className="profile">
                                        <div className="profilePicture">

                                        </div>

                                        <div className="profileInfo">
                                            Plug-EV
                                            <br/>
                                            General Phone Number: 0710710271
                                            <br/>
                                            Mobile Number: 0710710271
                                            <br/>
                                            Address:
                                            <br/>
                                            Bank Acc No:
                                            <br/>
                                            Bank Acc Name:
                                            <br/>
                                            Bank:
                                            <br/>
                                            Bank Branch:

                                        </div>


                                    </div>

                                    <br/>
                                    <br/>
                                    <br/>

                                    {/*<div className="clearfix">*/}
                                    {/*    <div className="buttonSet">*/}
                                    {/*        <Button color="default" className="mr-2" size="md">*/}
                                    {/*            Add new station.. <FontAwesomeIcon icon={faChargingStation}> </FontAwesomeIcon>*/}
                                    {/*        </Button>*/}

                                    {/*        <Button color="default" className="mr-2" size="md">*/}
                                    {/*            Update Network.. <i className="fa fa-edit text-light"/>*/}
                                    {/*        </Button>*/}
                                    {/*    </div>*/}
                                    {/*</div>*/}

                                </Widget>
                            </Col>

                            <Col lg={12} xs={12}>
                                <Widget
                                    title={
                                        <h5>
                                            Charging Progress in <span
                                            className="fw-semi-bold">This Week (kWh)</span>
                                        </h5>
                                    }

                                    collapse
                                    close
                                >
                                    <LineChartComponent/>

                                </Widget>
                            </Col>


                            <Col lg={12} md={12} sm={12}>
                                <Widget
                                    title={
                                        <h5>
                                            Charging Network Accounts <span className="fw-semi-bold">Information</span>
                                        </h5>
                                    }
                                    refresh
                                    collapse
                                    close
                                >


                                    <div className={`widget-table-overflow ${s.overFlow}`}>
                                        <Table className="table-striped table-lg mt-lg mb-0">

                                            <thead>
                                            <tr>
                                                <th>Chargers Station</th>
                                                <th className="text-right">Total User Units (kWh)</th>
                                                <th className="text-right">Total Admin Units (kWh)</th>
                                                <th className="text-right">Total User Amount (LKR)</th>
                                                <th className="text-right">Total Admin Amount (LKR)</th>
                                                <th className="text-right">System Maintainers (LKR)</th>
                                                <th className="text-center">Charging Progress</th>
                                            </tr>
                                            </thead>

                                            <tbody>
                                            <tr>
                                                <td><Link
                                                    to="/app/charging stations/Network Information/Chargers Station Information">
                                                    <h7 className="fw-bold"> Kottawa</h7>
                                                </Link></td>
                                                <th className="text-center">1,428.5</th>
                                                <th className="text-right">214.28</th>
                                                <td className="text-right">100,000</td>
                                                <td className="text-right">15,000</td>
                                                <td className="text-right">10,000</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[13, 14, 16, 15, 4, 14, 20]}
                                                        style={{width: "35px", height: "20px"}}
                                                    >
                                                        <SparklinesBars style={{fill: "#1870DC"}}/>
                                                    </Sparklines>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td><a href="#">
                                                    <h7 className="fw-bold"> Pilimathalawa</h7>
                                                </a></td>
                                                <th className="text-center">1,428.5</th>
                                                <th className="text-right">214.28</th>
                                                <td className="text-right">100,000</td>
                                                <td className="text-right">15,000</td>
                                                <td className="text-right">10,000</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[14, 12, 16, 11, 17, 19, 16]}
                                                        style={{width: "35px", height: "20px"}}
                                                    >
                                                        <SparklinesBars style={{fill: "#F45722"}}/>
                                                    </Sparklines>
                                                </td>
                                            </tr>

                                            <tr>
                                                <td><a href="#">
                                                    <h7 className="fw-bold"> Negombo</h7>
                                                </a></td>
                                                <th className="text-center">1,428.5</th>
                                                <th className="text-right">214.28</th>
                                                <td className="text-right">100,000</td>
                                                <td className="text-right">15,000</td>
                                                <td className="text-right">10,000</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[16, 15, 12, 14, 13, 14, 20]}
                                                        style={{width: "35px", height: "20px"}}
                                                    >
                                                        <SparklinesBars style={{fill: "#4ebfbb"}}/>
                                                    </Sparklines>
                                                </td>
                                            </tr>

                                            <tr>
                                                <td><a href="#">
                                                    <h7 className="fw-bold"> Ja-Ela</h7>
                                                </a></td>
                                                <th className="text-center">1,428.5</th>
                                                <th className="text-right">214.28</th>
                                                <td className="text-right">100,000</td>
                                                <td className="text-right">15,000</td>
                                                <td className="text-right">10,000</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[11, 17, 19, 16, 14, 12, 16]}
                                                        style={{width: "35px", height: "20px"}}
                                                    >
                                                        <SparklinesBars style={{fill: "#f0af03"}}/>
                                                    </Sparklines>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td><a href="#">
                                                    <h7 className="fw-bold"> Kadawatha</h7>
                                                </a></td>
                                                <th className="text-center">1,428.5</th>
                                                <th className="text-right">214.28</th>
                                                <td className="text-right">100,000</td>
                                                <td className="text-right">15,000</td>
                                                <td className="text-right">10,000</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[13, 14, 20, 16, 15, 4, 14]}
                                                        style={{width: "35px", height: "20px"}}
                                                    >
                                                        <SparklinesBars style={{fill: "#58D777"}}/>
                                                    </Sparklines>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td><a href="#">
                                                    <h7 className="fw-bold"> Kurunegala</h7>
                                                </a></td>
                                                <th className="text-center">1,428.5</th>
                                                <th className="text-right">214.28</th>
                                                <td className="text-right">100,000</td>
                                                <td className="text-right">15,000</td>
                                                <td className="text-right">10,000</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[16, 15, 4, 14, 13, 14, 20]}
                                                        style={{width: "35px", height: "20px"}}
                                                    >
                                                        <SparklinesBars style={{fill: "#4ebfbb"}}/>
                                                    </Sparklines>
                                                </td>
                                            </tr>

                                            <tr>
                                                <td><a href="#">
                                                    <h7 className="fw-bold"> Dambulla</h7>
                                                </a></td>
                                                <th className="text-center">1,428.5</th>
                                                <th className="text-right">214.28</th>
                                                <td className="text-right">100,000</td>
                                                <td className="text-right">15,000</td>
                                                <td className="text-right">10,000</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[14, 12, 16, 11, 17, 19, 16]}
                                                        style={{width: "35px", height: "20px"}}
                                                    >
                                                        <SparklinesBars style={{fill: "#F45722"}}/>
                                                    </Sparklines>
                                                </td>
                                            </tr>

                                            </tbody>
                                        </Table>
                                    </div>


                                </Widget>
                            </Col>
                        </Row>

                    </Widget>
                </Col>

            </div>
        );
    }
}

export default NetworkAccData;

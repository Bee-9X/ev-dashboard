import React from "react";
import {Button, Col, Input, InputGroup, InputGroupAddon, InputGroupText, Label, Row, Table,} from "reactstrap";

import s from "../../tables/static/Static.module.scss";
import ss from "../../dashboard/Dashboard.module.scss";
import './stationsDataTableStyles.css';
import Widget from "../../../components/Widget";
import BarChartComponent from "../BarChart/BarChart";
import BatteryAnimationComponent from "../../../components/AnimatedBattery/ANIMATION_1/batteryAnimation";
import BatteryAnimationComponent2 from "../../../components/AnimatedBattery/ANIMATION_2/batteryAnimation2";


class TerminalRecordsComponent extends React.Component {


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
                                Terminal's <span className="fw-semi-bold">Charging Records</span>
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


                            <Row>
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

                                <Col lg={6} xs={12}>
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


                                <Col lg={3} md={12} sm={12}>
                                    <Widget
                                        title={
                                            <h5>
                                                Current <span className="fw-semi-bold">Status</span>
                                            </h5>
                                        }

                                        collapse
                                        close
                                    >
                                        <BatteryAnimationComponent2/>


                                    </Widget>
                                </Col>


                                <Col lg={12} md={12} sm={12}>
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

                                            <h5>Terminal No:</h5>
                                            <h5>Terminal type:</h5>

                                            <br/>

                                            <h5>Admin account Unit:</h5>
                                            <h5>User account Unit:</h5>
                                            <h5>Total kWh:</h5>

                                            <br/>

                                            <h5>Admin amount:</h5>
                                            <h5>User amount:</h5>
                                            <h5>Total amount:</h5>

                                        </div>

                                    </Widget>
                                </Col>



                                <Col lg={12} md={12} sm={12}>
                                    <Widget
                                        title={
                                            <h5>
                                                Charged <span className="fw-semi-bold">Records</span>
                                            </h5>
                                        }

                                        collapse
                                        close
                                    >


                                        {/*for search*/}
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
                                                <i className="fa fa-search text-light"/>
                                            </button>
                                        </span>
                                        </div>



                                        <div className={`widget-table-overflow ${s.overFlow}`}>
                                            <Table className="table-striped table-lg mt-lg mb-0">

                                                <thead>
                                                <tr>
                                                    <th>User identity</th>
                                                    <th className="text-right">Phone number</th>
                                                    <th className="text-right">Date</th>
                                                    <th className="text-right">Charge start time</th>
                                                    <th className="text-right">Charge end time</th>
                                                    <th className="text-right">Total kW h</th>
                                                    <th className="text-right">Charge Fee</th>
                                                </tr>
                                                </thead>

                                                <tbody>


                                                <tr>
                                                    <th> 0000001</th>
                                                    <th className="text-right">0714567899</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">7.09AM</th>
                                                    <th className="text-right">7.45AM</th>
                                                    <th className="text-right">15.00 kW h</th>
                                                    <th className="text-right">1050 LKR</th>

                                                </tr>
                                                <tr>
                                                    <th> 0000005</th>
                                                    <th className="text-right">0714567000</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">8.45AM</th>
                                                    <th className="text-right">9.05AM</th>
                                                    <th className="text-right">10.02 kW h</th>
                                                    <th className="text-right">714 LKR</th>

                                                </tr>

                                                <tr>
                                                    <th> 0000009</th>
                                                    <th className="text-right">0714567000</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">9.45AM</th>
                                                    <th className="text-right">10.05AM</th>
                                                    <th className="text-right">10.02 kW h</th>
                                                    <th className="text-right">714 LKR</th>

                                                </tr>
                                                <tr>
                                                    <th> 0000002</th>
                                                    <th className="text-right">0714567000</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">10.45AM</th>
                                                    <th className="text-right">11.05AM</th>
                                                    <th className="text-right">10.02 kW h</th>
                                                    <th className="text-right">714 LKR</th>

                                                </tr>
                                                <tr>
                                                    <th> 0000006</th>
                                                    <th className="text-right">0714567000</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">11.45AM</th>
                                                    <th className="text-right">12.05PM</th>
                                                    <th className="text-right">10.02 kW h</th>
                                                    <th className="text-right">714 LKR</th>

                                                </tr>


                                                <tr>
                                                    <th> 0000001</th>
                                                    <th className="text-right">0714567899</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">7.09AM</th>
                                                    <th className="text-right">7.45AM</th>
                                                    <th className="text-right">15.00 kW h</th>
                                                    <th className="text-right">1050 LKR</th>

                                                </tr>
                                                <tr>
                                                    <th> 0000005</th>
                                                    <th className="text-right">0714567000</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">8.45AM</th>
                                                    <th className="text-right">9.05AM</th>
                                                    <th className="text-right">10.02 kW h</th>
                                                    <th className="text-right">714 LKR</th>

                                                </tr>

                                                <tr>
                                                    <th> 0000009</th>
                                                    <th className="text-right">0714567000</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">9.45AM</th>
                                                    <th className="text-right">10.05AM</th>
                                                    <th className="text-right">10.02 kW h</th>
                                                    <th className="text-right">714 LKR</th>

                                                </tr>
                                                <tr>
                                                    <th> 0000002</th>
                                                    <th className="text-right">0714567000</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">10.45AM</th>
                                                    <th className="text-right">11.05AM</th>
                                                    <th className="text-right">10.02 kW h</th>
                                                    <th className="text-right">714 LKR</th>

                                                </tr>
                                                <tr>
                                                    <th> 0000006</th>
                                                    <th className="text-right">0714567000</th>
                                                    <th className="text-right">January 02, 2022</th>
                                                    <th className="text-right">11.45AM</th>
                                                    <th className="text-right">12.05PM</th>
                                                    <th className="text-right">10.02 kW h</th>
                                                    <th className="text-right">714 LKR</th>

                                                </tr>

                                                </tbody>
                                            </Table>
                                        </div>
                                    </Widget>
                                </Col>
                            </Row>
                        </div>
                    </Widget>
                </Col>
            </div>
        );


    }
}

export default TerminalRecordsComponent;

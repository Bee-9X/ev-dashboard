import React from 'react';
import {
    Badge,
    Col,
    Nav,
    NavItem,
    NavLink,
    Row,
    Table,
    TabContent,
    TabPane,
    Input,
    Label,
    InputGroup, InputGroupAddon, InputGroupText, Button,
} from 'reactstrap';
import classnames from 'classnames';


import s from "../../../pages/tables/static/Static.module.scss";
import Widget from "../../../components/Widget";
import ss from "../../dashboard/Dashboard.module.scss";
import BarChartComponent from "../../chargingStations/BarChart/BarChart";
import BatteryAnimationComponent from "../../../components/AnimatedBattery/ANIMATION_1/batteryAnimation";
import BatteryAnimationComponent2 from "../../../components/AnimatedBattery/ANIMATION_2/batteryAnimation2";



class EVUserProfileComponent extends React.Component {
    constructor(props) {
        super(props);
        this.toggle = this.toggle.bind(this);
        this.state = {
            activeTab: '1',
            checkboxes1: [true, false, false, false, false],
        };
        this.checkAll = this.checkAll.bind(this);
    }

    toggle(tab) {
        if (this.state.activeTab !== tab) {
            this.setState({
                activeTab: tab,
            });
        }
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

            <section className={`${s.root} mb-4`}>
                {/*<h1 className="page-title">UI - <span className="fw-semi-bold">Icons</span></h1>*/}
                <h2 className="page-title">
                    <span className="fw-semi-bold">User </span> Management
                </h2>

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

                                <br />

                                <Label for="date">From </Label>
                                <InputGroup className="input-group-no-border">
                                    <InputGroupAddon addonType="prepend">
                                        <InputGroupText>
                                            <i className=" la la-calendar text-white" />
                                        </InputGroupText>
                                    </InputGroupAddon>
                                    <Input id="date" className="input-transparent pl-3"
                                        // value={this.state.loginEmail}
                                        // onChange={this.loginEmail}
                                           type="date"
                                           required name="date" placeholder="from date" />
                                </InputGroup>


                                <Label for="date">To</Label>
                                <InputGroup className="input-group-no-border">
                                    <InputGroupAddon addonType="prepend">
                                        <InputGroupText>
                                            <i className="la la-calendar text-white" />
                                        </InputGroupText>
                                    </InputGroupAddon>
                                    <Input id="date" className="input-transparent pl-3"
                                        // value={this.state.loginEmail}
                                        // onChange={this.loginEmail}
                                           type="date"
                                           required name="date" placeholder="from date" />
                                </InputGroup>

                                <br />
                                <div className="clearfix">
                                    <div className="-float-center">
                                        <Button color="default" className="mr-2" size="md">
                                            Search.. <i className="fa fa-search text-light" />
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
                                    Current <span className="fw-semi-bold">Status</span>
                                </h5>
                            }

                            collapse
                            close
                        >
                            <BatteryAnimationComponent2 />
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
                            <BarChartComponent />

                        </Widget>
                    </Col>

                    <Col lg={12} md={12} sm={12}>
                        <Widget
                            title={
                                <h5>
                                    User <span className="fw-semi-bold">Information</span>
                                </h5>
                            }

                            collapse
                            close
                        >

                            <div className="chargingInfoBox">


                                <h5>User Name:</h5>
                                <h5>Email:</h5>
                                <h5>Phone No:</h5>
                                <h5>Acc Balance:</h5>

                                <br/>

                                <h5>Total kWh:</h5>
                                <h5>Total amount:</h5>

                            </div>

                            <br/>
                            <div className="clearfix">
                                <div className="buttonSet">

                                    <Button color="default" className="mr-2" size="md">
                                        Block This User.. <i className="fa fa-user-times"/>
                                    </Button>
                                </div>
                            </div>

                        </Widget>
                    </Col>

                </Row>

                {/* tabs */}
                <Nav className="navigate" tabs>

                    <NavItem>
                        <NavLink
                            className={classnames({ active: this.state.activeTab === '1' })}
                            onClick={() => {
                                this.toggle('1');
                            }}
                            //style={{marginBottom: "-1px !important"}}
                        >
                            <span className="text-white"><strong>Transaction History</strong></span>
                        </NavLink>
                    </NavItem>

                    <NavItem>
                        <NavLink
                            className={classnames({ active: this.state.activeTab === '2' })}
                            onClick={() => {
                                this.toggle('2');
                            }}
                        >
                            <span className="text-white"><strong>TopUps History</strong></span>
                            {/*<Badge color="primary" style={{padding: "3px 8px"}}>new</Badge>*/}
                        </NavLink>
                    </NavItem>

                    <NavItem>
                        <NavLink
                            className={classnames({ active: this.state.activeTab === '3' })}
                            onClick={() => {
                                this.toggle('3');
                            }}
                        >
                            <span className="text-white"><strong>Charging History</strong></span>
                            {/*<Badge color="primary" style={{padding: "3px 8px"}}>new</Badge>*/}
                        </NavLink>
                    </NavItem>


                </Nav>

                {/* tab content */}

                <TabContent activeTab={this.state.activeTab}>
                    {/* tab #1 */}
                    <TabPane tabId="1">

                        <Col lg={12} md={12} sm={12}>
                            <Widget
                                title={
                                    <h5>
                                        TRANSACTION <span className="fw-semi-bold">History</span>
                                    </h5>
                                }
                                refresh
                                collapse
                                close
                            >

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
                                            <th>Transaction ID</th>
                                            <th className="text-right">Date</th>
                                            <th className="text-right">Time</th>
                                            <th className="text-right">Description</th>
                                            <th className="text-right">Amount</th>
                                            <th className="text-right">ACC Balance</th>
                                        </tr>
                                        </thead>

                                        <tbody>


                                        <tr>
                                            <th> 987456321</th>
                                            <th className="text-right">January 02, 2022</th>
                                            <th className="text-right">9.05AM</th>
                                            <th className="text-right">TopUp </th>
                                            <th className="text-right">10000 <Badge color="success"><i className="fa fa-plus"/></Badge></th>
                                            <th className="text-right">10000 <Badge color="success"><i className="fa fa-arrow-up"/></Badge></th>

                                        </tr>

                                        <tr>
                                            <th> 456321789</th>
                                            <th className="text-right">January 02, 2022</th>
                                            <th className="text-right">9.07AM</th>
                                            <th className="text-right">Charging@Kinro_Kottawa_001 </th>
                                            <th className="text-right">1000 <Badge color="danger"><i className="fa fa-minus"/></Badge></th>
                                            <th className="text-right">9000 <Badge color="danger"><i className="fa fa-arrow-down"/></Badge></th>

                                        </tr>

                                        <tr>
                                            <th> 741025896</th>
                                            <th className="text-right">January 03, 2022</th>
                                            <th className="text-right">9.10AM</th>
                                            <th className="text-right">Charging@Kinro_Kottawa_002 </th>
                                            <th className="text-right">1000 <Badge color="danger"><i className="fa fa-minus"/></Badge></th>
                                            <th className="text-right">8000 <Badge color="danger"><i className="fa fa-arrow-down"/></Badge></th>

                                        </tr>

                                        <tr>
                                            <th> 456321789</th>
                                            <th className="text-right">January 04, 2022</th>
                                            <th className="text-right">9.30AM</th>
                                            <th className="text-right">Charging@Kinro_Kottawa_001 </th>
                                            <th className="text-right">1000 <Badge color="danger"><i className="fa fa-minus"/></Badge></th>
                                            <th className="text-right">7000 <Badge color="danger"><i className="fa fa-arrow-down"/></Badge></th>

                                        </tr>

                                        </tbody>
                                    </Table>
                                </div>

                            </Widget>
                        </Col>
                    </TabPane>

                    {/* tab #2 */}
                    <TabPane tabId="2">

                        <Col lg={12} md={12} sm={12}>
                            <Widget
                                title={
                                    <h5>
                                        TOP-UP <span className="fw-semi-bold">History</span>
                                    </h5>
                                }
                                refresh
                                collapse
                                close
                            >

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
                                            <th>Transaction ID</th>
                                            <th className="text-right">Date</th>
                                            <th className="text-right">Time</th>
                                            <th className="text-right">Amount</th>
                                        </tr>
                                        </thead>

                                        <tbody>


                                        <tr>
                                            <th> 987456321</th>
                                            <th className="text-right">January 02, 2022</th>
                                            <th className="text-right">9.05AM</th>
                                            <th className="text-right">10000 <Badge color="success"><i className="fa fa-arrow-up"/></Badge></th>

                                        </tr>



                                        </tbody>
                                    </Table>
                                </div>

                            </Widget>
                        </Col>
                    </TabPane>


                    {/* tab #3 */}
                    <TabPane tabId="3">

                        <Col lg={12} md={12} sm={12}>
                            <Widget
                                title={
                                    <h5>
                                        CHARGING <span className="fw-semi-bold">History</span>
                                    </h5>
                                }
                                refresh
                                collapse
                                close
                            >

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
                                            <th>Transaction ID</th>
                                            <th className="text-right">Date</th>
                                            <th className="text-right"> Start Time</th>
                                            <th className="text-right"> End Time</th>
                                            <th className="text-right"> Station</th>
                                            <th className="text-right"> Terminal</th>
                                            <th className="text-right">End %</th>
                                            <th className="text-right">Total Charged Power</th>
                                            <th className="text-right">Amount</th>
                                        </tr>
                                        </thead>

                                        <tbody>

                                        <tr>
                                            <th> 456321789</th>
                                            <th className="text-right">January 02, 2022</th>
                                            <th className="text-right">9.07AM</th>
                                            <th className="text-right">9.30AM</th>
                                            <th className="text-right">Kinro_Kottawa</th>
                                            <th className="text-right">001</th>
                                            <th className="text-right">80% </th>
                                            <th className="text-right">10 kWh </th>
                                            <th className="text-right">1000 <Badge color="danger"><i className="fa fa-arrow-down"/></Badge></th>

                                        </tr>

                                        <tr>
                                            <th> 741025896</th>
                                            <th className="text-right">January 03, 2022</th>
                                            <th className="text-right">9.10AM</th>
                                            <th className="text-right">9.40AM</th>
                                            <th className="text-right">Kinro_Kottawa</th>
                                            <th className="text-right">002</th>
                                            <th className="text-right">80% </th>
                                            <th className="text-right">10 kWh </th>
                                            <th className="text-right">1000 <Badge color="danger"><i className="fa fa-arrow-down"/></Badge></th>

                                        </tr>

                                        <tr>
                                            <th> 456321789</th>
                                            <th className="text-right">January 04, 2022</th>
                                            <th className="text-right">9.30AM</th>
                                            <th className="text-right">10.01AM</th>
                                            <th className="text-right">Kinro_Kottawa</th>
                                            <th className="text-right">001</th>
                                            <th className="text-right">80% </th>
                                            <th className="text-right">10 kWh </th>
                                            <th className="text-right">1000 <Badge color="danger"><i className="fa fa-arrow-down"/></Badge></th>

                                        </tr>

                                        </tbody>
                                    </Table>
                                </div>
                            </Widget>
                        </Col>
                    </TabPane>
                </TabContent>
            </section>
        );
    }
}

export default EVUserProfileComponent;

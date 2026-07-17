import React from 'react';
import { Badge, Col, Nav, NavItem, NavLink, Row, TabContent, TabPane, } from 'reactstrap';
import classnames from 'classnames';


import s from './Static.module.scss';
import Widget from "../../components/Widget";
import ChargingNetworkComponent from "./Network/chargingNetworks";
import ChargersStationsComponent from "./ChargersStation/chargersStations";
import TerminalsComponent from "./Terminal/terminals";

class stationsStatic extends React.Component {
    constructor(props) {
        super(props);
        this.toggle = this.toggle.bind(this);
        this.state = {
            activeTab: '1',
        };
    }

    toggle(tab) {
        if (this.state.activeTab !== tab) {
            this.setState({
                activeTab: tab,
            });
        }
    }

    render() {
        return (


            <section className={`${s.root} mb-4`}>
                {/*<h1 className="page-title">UI - <span className="fw-semi-bold">Icons</span></h1>*/}
                <h2 className="page-title">
                    <span className="fw-semi-bold">Charging Station</span> Details
                </h2>

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
                            <span className="text-white"><strong>Charging Networks</strong></span>
                        </NavLink>
                    </NavItem>

                    <NavItem>
                        <NavLink
                            className={classnames({ active: this.state.activeTab === '2' })}
                            onClick={() => {
                                this.toggle('2');
                            }}
                        >
                            <span className="text-white"><strong>Chargers Stations</strong></span>
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
                            <span className="text-white"><strong>Charger Terminals</strong></span>
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
                                        Charging Network <span className="fw-semi-bold">Information</span>
                                    </h5>
                                }
                                refresh
                                collapse
                                close
                            >
                                <ChargingNetworkComponent />

                            </Widget>
                        </Col>



                    </TabPane>

                    {/* tab #2 */}
                    <TabPane tabId="2">

                        <Col lg={12} md={12} sm={12}>
                            <Widget
                                title={
                                    <h5>
                                        Chargers Stations <span className="fw-semi-bold">Information</span>
                                    </h5>
                                }
                                refresh
                                collapse
                                close
                            >
                                <ChargersStationsComponent />

                            </Widget>
                        </Col>

                    </TabPane>

                    {/* tab #3 */}
                    <TabPane tabId="3">

                        <Col lg={12} md={12} sm={12}>
                            <Widget
                                title={
                                    <h5>
                                        Terminal's <span className="fw-semi-bold">Information</span>
                                    </h5>
                                }
                                refresh
                                collapse
                                close
                            >
                                <TerminalsComponent />

                            </Widget>
                        </Col>


                    </TabPane>


                </TabContent>
            </section>
        );
    }
}

export default stationsStatic;

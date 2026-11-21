import React from "react";
import {
    Badge,
    Button,
    Col,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Input,
    Label,
    Progress,
    Row,
    Table,
    UncontrolledButtonDropdown,
} from "reactstrap";
import { Sparklines, SparklinesBars } from "react-sparklines";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChargingStation } from '@fortawesome/free-solid-svg-icons'

import s from "../../tables/static/Static.module.scss";
import "./networkStyles.css";
import Widget from "../../../components/Widget";
import {Link} from "react-router-dom";
import ChargingNetworkComponent from "./chargingNetworks";
import BarChartComponent from "../BarChart/BarChart";

class NetworkInfoComponent extends React.Component {
    constructor(props) {
        super(props);

        this.state = {

        };
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
                                    <div className="clearfix">
                                        <div className="buttonSet">
                                            <Button color="default" className="mr-2" size="md">
                                                Add new station.. <FontAwesomeIcon icon={faChargingStation}> </FontAwesomeIcon>
                                            </Button>

                                            <Button color="default" className="mr-2" size="md">
                                                Update Network.. <i className="fa fa-edit text-light"/>
                                            </Button>
                                        </div>
                                    </div>

                                </Widget>
                            </Col>

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


                                    <div className={`widget-table-overflow ${s.overFlow}`}>
                                        <Table className="table-striped table-lg mt-lg mb-0">

                                            <thead>
                                            <tr>
                                                <th>Chargers Station</th>
                                                <th className="text-right">Number of terminals</th>
                                                <th className="text-right">Types of terminals</th>
                                                <th className="text-right">Address</th>
                                                <th className="text-right">Phone No</th>
                                                <th className="text-center">Charging Progress</th>
                                            </tr>
                                            </thead>

                                            <tbody>
                                            <tr>
                                                <td><Link to="/app/charging stations/Network Information/Chargers Station Information"><h7 className="fw-bold"> Kottawa </h7></Link></td>
                                                <th className="text-center">3</th>
                                                <th className="text-right">CHAdeMo, J1772</th>
                                                <td className="text-right">Makumbura Pannipitiya</td>
                                                <td className="text-right">0710710271</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[13, 14, 16, 15, 4, 14, 20]}
                                                        style={{ width: "35px", height: "20px" }}
                                                    >
                                                        <SparklinesBars style={{ fill: "#1870DC" }} />
                                                    </Sparklines>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td><a href="#"> <h7 className="fw-bold"> Pilimathalawa </h7> </a></td>
                                                <th className="text-center">1</th>
                                                <th className="text-right">CHAdeMo</th>
                                                <td className="text-right">464/c A1, Pilimathalawa</td>
                                                <td className="text-right"> 0717771710</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[14, 12, 16, 11, 17, 19, 16]}
                                                        style={{ width: "35px", height: "20px" }}
                                                    >
                                                        <SparklinesBars style={{ fill: "#F45722" }} />
                                                    </Sparklines>
                                                </td>
                                            </tr>

                                            <tr>
                                                <td><a href="#"> <h7 className="fw-bold"> Negombo </h7> </a></td>
                                                <th className="text-center">1</th>
                                                <th className="text-right">CHAdeMo</th>
                                                <td className="text-right">123A, Negombo</td>
                                                <td className="text-right">0710710271</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[16, 15, 12, 14, 13, 14, 20]}
                                                        style={{ width: "35px", height: "20px" }}
                                                    >
                                                        <SparklinesBars style={{ fill: "#4ebfbb" }} />
                                                    </Sparklines>
                                                </td>
                                            </tr>

                                            <tr>
                                                <td><a href="#"> <h7 className="fw-bold"> Ja-Ela </h7> </a></td>
                                                <th className="text-center">1</th>
                                                <th className="text-right">CHAdeMo</th>
                                                <td className="text-right">Aproma, Ja-ela</td>
                                                <td className="text-right">0710710271</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[11, 17, 19, 16, 14, 12, 16]}
                                                        style={{ width: "35px", height: "20px" }}
                                                    >
                                                        <SparklinesBars style={{ fill: "#f0af03" }} />
                                                    </Sparklines>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td><a href="#"> <h7 className="fw-bold"> Kadawatha </h7> </a></td>
                                                <th className="text-center">1</th>
                                                <th className="text-right">CHAdeMo, CCS Type 1 </th>
                                                <td className="text-right">456B, Kadawatha</td>
                                                <td className="text-right">0710710271</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[13, 14, 20, 16, 15, 4, 14]}
                                                        style={{ width: "35px", height: "20px" }}
                                                    >
                                                        <SparklinesBars style={{ fill: "#58D777" }} />
                                                    </Sparklines>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td><a href="#"> <h7 className="fw-bold"> Kurunegala </h7> </a></td>
                                                <th className="text-center">2</th>
                                                <th className="text-right">CHAdeMo</th>
                                                <td className="text-right">123A, Kurunegala</td>
                                                <td className="text-right">0710710271</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[16, 15, 4, 14, 13, 14, 20]}
                                                        style={{ width: "35px", height: "20px" }}
                                                    >
                                                        <SparklinesBars style={{ fill: "#4ebfbb" }} />
                                                    </Sparklines>
                                                </td>
                                            </tr>

                                            <tr>
                                                <td><a href="#"> <h7 className="fw-bold"> Dambulla </h7> </a></td>
                                                <th className="text-center">1</th>
                                                <th className="text-right">CHAdeMo</th>
                                                <td className="text-right">Pannampitiya Dambulla</td>
                                                <td className="text-right">0710710271</td>
                                                <td className="text-center">
                                                    <Sparklines
                                                        data={[14, 12, 16, 11, 17, 19, 16]}
                                                        style={{ width: "35px", height: "20px" }}
                                                    >
                                                        <SparklinesBars style={{ fill: "#F45722" }} />
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

export default NetworkInfoComponent;

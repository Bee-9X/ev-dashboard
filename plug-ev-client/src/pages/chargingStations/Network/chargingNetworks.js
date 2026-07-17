import React from "react";
import {Badge, Button, Progress, Table,} from "reactstrap";
import s from "../../tables/static/Static.module.scss";
import {Link, withRouter} from 'react-router-dom';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faNetworkWired} from "@fortawesome/free-solid-svg-icons";

class ChargingNetworkComponent extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            tableStyles: [
                {
                    id: 1,
                    picture: require("../../../assets/tables/1.png"), // eslint-disable-line global-require
                    description: <Link to="/app/charging stations/Network Information"><h6
                        className="fw-bold"> Plug-EV </h6></Link>,
                    info: {
                        Stations: 10,
                        Terminals: 15,
                    },
                    date: new Date("September 14, 2012"),
                    size: "450kW",
                    progress: {
                        percent: 29,
                        colorClass: "success",
                    },
                },
                {
                    id: 2,
                    picture: require("../../../assets/tables/2.png"), // eslint-disable-line global-require
                    description: <a href="#"><h6 className="fw-bold"> Green Frontiers </h6></a>,
                    info: {
                        Stations: 5,
                        Terminals: 5,
                    },
                    date: new Date("November 14, 2012"),
                    size: "150kW",
                    progress: {
                        percent: 33,
                        colorClass: "warning",
                    },
                },
                {
                    id: 3,
                    picture: require("../../../assets/tables/3.png"), // eslint-disable-line global-require
                    description: <a href="#"><h6 className="fw-bold"> Kinro </h6></a>,
                    label: {
                        colorClass: "primary",
                        text: "INFO!",
                    },
                    info: {
                        Stations: 5,
                        Terminals: 5,
                    },
                    date: new Date("September 14, 2012"),
                    size: "150kW",
                    progress: {
                        percent: 38,
                        colorClass: "inverse",
                    },
                },
                {
                    id: 4,
                    picture: require("../../../assets/tables/4.png"), // eslint-disable-line global-require
                    description: <a href="#"><h6 className="fw-bold"> Ikman EV </h6></a>,
                    info: {
                        Stations: 5,
                        Terminals: 5,
                    },
                    date: new Date("September 15, 2012"),
                    size: "150kW",
                    progress: {
                        percent: 17,
                        colorClass: "danger",
                    },
                },
                {
                    id: 5,
                    picture: require("../../../assets/tables/5.png"), // eslint-disable-line global-require
                    description: <a href="#"><h6 className="fw-bold"> Solar life </h6></a>,
                    info: {
                        Stations: 5,
                        Terminals: 5,
                    },
                    date: new Date("October 1, 2012"),
                    size: "150kW",
                    progress: {
                        percent: 41,
                        colorClass: "primary",
                    },
                },
            ],
        };

    }

    parseDate(date) {
        this.dateSet = date.toDateString().split(" ");

        return `${date.toLocaleString("en-us", {month: "long"})} ${
            this.dateSet[2]
        }, ${this.dateSet[3]}`;
    }


    render() {
        return (
            <div className={s.root}>
                <h3>
                    Charging Networks <span className="fw-semi-bold">Live Information</span>
                </h3>

                <p>
                    Add any non-bordered .table within a widget for a seamless
                    design. Awesome look for no cost. Just wrap the table with
                    simple css class <code>.widget-table-overflow</code> inside of
                    widget
                </p>

                <div>
                    <div className={s.overFlow}>
                        <Table lg={12} md={12} sm={12} striped>
                            <thead>
                            <tr className="fs-sm">
                                <th className="hidden-sm-down">#</th>
                                <th>Profile Picture</th>
                                <th>Network</th>
                                <th className="hidden-sm-down">Info</th>
                                <th className="hidden-sm-down">Last Charged</th>
                                <th className="hidden-sm-down">Total Capacity</th>
                                <th className="hidden-sm-down">Status</th>
                            </tr>
                            </thead>
                            <tbody>
                            {this.state.tableStyles.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.id}</td>
                                    <td>
                                        <img
                                            className="img-rounded"
                                            src={row.picture}
                                            alt=""
                                            height="50"
                                        />
                                    </td>
                                    <td>
                                        {row.description}
                                        {row.label && (
                                            <div>
                                                <Badge color={row.label.colorClass}>
                                                    {row.label.text}
                                                </Badge>
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <p className="mb-0">
                                            <small>
                                                Stations:
                                                <span className="text-muted fw-semi-bold">
                                                &nbsp; {row.info.Stations}
                            </span>
                                            </small>
                                        </p>
                                        <p>
                                            <small>
                                                Terminals:
                                                <span className="text-muted fw-semi-bold">
                                                &nbsp; {row.info.Terminals}
                            </span>
                                            </small>
                                        </p>
                                    </td>
                                    <td className="text-muted">{this.parseDate(row.date)}</td>
                                    <td className="text-muted">{row.size}</td>
                                    <td className="width-150">
                                        <Progress
                                            color={row.progress.colorClass}
                                            value={row.progress.percent}
                                            className="progress-sm mb-xs"
                                        />
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </Table>
                    </div>
                    <div className="clearfix">

                        <div className="float-md-right">

                            <button type="button" className="btn btn-outline-primary">
                                Add new network.. <FontAwesomeIcon icon={faNetworkWired}> </FontAwesomeIcon>
                            </button>

                            <button type="button" className="btn btn-outline-primary">
                                Delete Network.. <i className="fa fa-trash text-danger"/>
                            </button>

                            <button type="button" className="btn btn-outline-primary">
                                Inactive Network.. <i className="fa fa-adjust text-warning"/>
                            </button>

                            <button type="button" className="btn btn-outline-primary">
                                Active Network.. <i className="fa fa-line-chart text-success"/>
                            </button>


                        </div>
                        <p>Basic data of Charging networks</p>
                    </div>
                </div>

            </div>
        );
    }
}

export default withRouter(ChargingNetworkComponent);

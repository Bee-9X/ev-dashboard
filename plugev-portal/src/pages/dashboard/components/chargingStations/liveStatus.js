import React from "react";
import './stationsDataTableStyles.css';
import s from "../../../tables/static/Static.module.scss";
import {Badge, Input, Label, Table} from "reactstrap";
import StatusBadge from "../../../../components/StatusBadge/StatusBadge";
import { fetchAllChargers, sendRemoteCommand } from "../../../../api";

class LiveStatusComponent extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            checkboxes1: [true, true, true, true, true],
            checkboxes2: [false, false, false, false, false, false],
            checkboxes3: [false, false, false, false, false, false],
            checkboxes4: [false, false, false, false, false, false],
            chargers: [],
            loading: true
        };
        this.checkAll = this.checkAll.bind(this);
    }

    componentDidMount() {
        this.loadChargers();
        this.pollInterval = setInterval(() => this.loadChargers(), 5000);
    }

    componentWillUnmount() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
    }

    async loadChargers() {
        try {
            const data = await fetchAllChargers();
            this.setState({ chargers: data, loading: false });
        } catch (error) {
            console.error("Failed to load chargers in LiveStatus:", error);
            this.setState({ loading: false });
        }
    }

    handleCommand = async (identity, backend, command) => {
        try {
            const result = await sendRemoteCommand(identity, backend, command);
            alert(`${identity}: ${result.message}`);
            this.loadChargers(); // Refresh status
        } catch (e) {
            console.error(e);
            alert(`${identity}: ${e.message}`);
        }
    }


    parseDate(date) {
        this.dateSet = date.toDateString().split(" ");

        return `${date.toLocaleString("en-us", {month: "long"})} ${
            this.dateSet[2]
        }, ${this.dateSet[3]}`;
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
            <div className="station-Data">
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
                                        <Label for="checkbox1"/>
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
                                        <Label for="checkbox2"/>
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
                                        <Label for="checkbox3"/>
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
                                        <Label for="checkbox4"/>
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
                                        <Label for="checkbox4"/>
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


                <br/>
                <br/>
                <h3>
                    Terminal's <span className="fw-semi-bold">Live Information here..!</span>
                </h3>
                <p>
                    {"Trace only what's really important. "}
                    <code>.table-hover</code> is made for it.
                </p>


                <div className="stationInfo">

                    <div className={s.overFlow}>
                        <Table className="table-striped table-lg mt-lg mb-0">
                            <thead>
                            <tr>
                                <th>#</th>
                                <th>Station Name</th>
                                <th>Connector Type</th>
                                <th>Terminal No</th>
                                <th>CURRENT Status</th>
                                <th>Actions</th>
                            </tr>
                            </thead>
                            {/* eslint-disable */}
                            <tbody>
                            {this.state.chargers.length > 0 ? (
                                this.state.chargers.map((charger, index) => (
                                    <tr key={charger.identity}>
                                        <td>{index + 1}</td>
                                        <td>
                                            <span className="fw-semi-bold">{charger.name || charger.identity}</span>
                                            <Badge color={charger.backend === 'SOAP' ? 'primary' : 'info'} style={{ marginLeft: '8px' }}>
                                                {charger.backend}
                                            </Badge>
                                            {charger.name && charger.name !== charger.identity && (
                                                <div className="text-muted small">{charger.identity}</div>
                                            )}
                                        </td>
                                        <td>{charger.info?.chargePointModel || '—'}</td>
                                        <td>{charger.connectors?.length ? `${charger.connectors.length} connector(s)` : '—'}</td>
                                        <td>
                                            <StatusBadge status={charger.status} pill />
                                        </td>
                                        <td>
                                            <button 
                                                className="btn btn-sm btn-success mr-2" 
                                                onClick={() => this.handleCommand(charger.identity, charger.backend, 'start')}
                                            >
                                                Start
                                            </button>
                                            <button 
                                                className="btn btn-sm btn-danger" 
                                                onClick={() => this.handleCommand(charger.identity, charger.backend, 'stop')}
                                            >
                                                Stop
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <>
                                <tr>
                                    <td>1</td>
                                    <td>Kottawa Kinro <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>001</td>
                                    <td>
                                        <Badge color="gray" className="text-secondary" pill>
                                            Offline
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>
                                <tr>
                                    <td>2</td>
                                    <td>Kottawa kinro <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>002</td>
                                    <td>
                                        <Badge color="gray" className="text-secondary" pill>
                                            Offline
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>
                                <tr>
                                    <td>3</td>
                                    <td>Kottawa kinro <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CCS type1</td>
                                    <td>003</td>
                                    <td>
                                        <Badge color="primary" className="text-secondary" pill>
                                            New
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>
                                <tr>
                                    <td>4</td>
                                    <td>Kadawatha <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>001</td>
                                    <td>
                                        <Badge color="success" className="text-secondary" pill>
                                            Online
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>

                                <tr>
                                    <td>5</td>
                                    <td>Kurunegala <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>001</td>
                                    <td>
                                        <Badge color="success" className="text-secondary" pill>
                                            Online
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>


                                <tr>
                                    <td>6</td>
                                    <td>Kurunegala <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>002</td>
                                    <td>
                                        <Badge color="success" className="text-secondary" pill>
                                            Online
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>


                                <tr>
                                    <td>7</td>
                                    <td>Dambulla <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>001</td>
                                    <td>
                                        <Badge color="success" className="text-secondary" pill>
                                            Online
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>


                                <tr>
                                    <td>8</td>
                                    <td>Pilimathalawa <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>001</td>
                                    <td>
                                        <Badge color="success" className="text-secondary" pill>
                                            Online
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>


                                <tr>
                                    <td>9</td>
                                    <td>Ja-ela <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>001</td>
                                    <td>
                                        <Badge color="success" className="text-secondary" pill>
                                            Online
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>


                                <tr>
                                    <td>10</td>
                                    <td>Negombo <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>001</td>
                                    <td>
                                        <Badge color="success" className="text-secondary" pill>
                                            Online
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>


                                <tr>
                                    <td>11</td>
                                    <td>Welisara <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>001</td>
                                    <td>
                                        <Badge color="success" className="text-secondary" pill>
                                            Online
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>


                                <tr>
                                    <td>12</td>
                                    <td>Galle <Badge color="secondary" className="ml-2">Demo</Badge></td>
                                    <td>CHAdeMo</td>
                                    <td>001</td>
                                    <td>
                                        <Badge color="success" className="text-secondary" pill>
                                            Online
                                        </Badge>
                                    </td>
                                    <td></td>
                                </tr>
                                </>
                            )}
                            </tbody>
                            {/* eslint-enable */}


                        </Table>
                    </div>
                </div>
            </div>
        );
    }
}

export default LiveStatusComponent;
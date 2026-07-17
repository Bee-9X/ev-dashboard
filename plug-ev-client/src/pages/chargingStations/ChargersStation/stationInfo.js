import React from "react";
import {Badge, Button, Col, Input, Label, Row, Table,} from "reactstrap";

import s from "../../tables/static/Static.module.scss";
import Widget from "../../../components/Widget";
import {Link} from "react-router-dom";
import BarChartComponent from "../BarChart/BarChart";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faChargingStation} from "@fortawesome/free-solid-svg-icons";
import { fetchAllChargers, sendRemoteCommand } from "../../../api";

class StationInfoComponent extends React.Component {
    constructor(props) {
        super(props);
        
        // Read initial charger selected in redirect state if present
        const passedId = props.location?.state?.chargerId || null;
        
        this.state = {
            checkboxes1: [false, false, true, true, true],
            activeChargers: [],
            selectedChargerId: passedId,
            idTag: 'CLIENT_USER',
            transactionId: 1,
            loadingCmd: false,
            logs: [`[${new Date().toLocaleTimeString()}] Live Console Initialized. Select a charger to start.`],
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
            this.setState({ activeChargers: data }, () => {
                // If we don't have a selected charger but there are active ones, select the first one
                if (!this.state.selectedChargerId && data.length > 0) {
                    this.setState({ selectedChargerId: data[0].identity });
                }
            });
        } catch (error) {
            console.error("Failed to load chargers in StationInfo:", error);
        }
    }

    handleStartCharging = async () => {
        const { selectedChargerId, idTag, activeChargers } = this.state;
        const charger = activeChargers.find(c => c.identity === selectedChargerId);
        if (!charger) return;

        this.setState({ loadingCmd: true });
        this.addLog(`Sending RemoteStartTransaction command for charger: ${selectedChargerId}...`);

        try {
            const res = await sendRemoteCommand(selectedChargerId, charger.backend, 'start', { idTag });
            if (res.success) {
                this.addLog(`[Success] RemoteStartTransaction sent successfully! ${res.simulated ? '(Simulated)' : ''}`);
                if (res.message) this.addLog(`Response message: ${res.message}`);
            } else {
                this.addLog(`[Error] Failed: ${res.error || 'Unknown error'}`);
            }
        } catch (error) {
            this.addLog(`[Error] HTTP request failed: ${error.message}`);
        } finally {
            this.setState({ loadingCmd: false });
            this.loadChargers(); // Refresh status immediately
        }
    }

    handleStopCharging = async () => {
        const { selectedChargerId, transactionId, activeChargers } = this.state;
        const charger = activeChargers.find(c => c.identity === selectedChargerId);
        if (!charger) return;

        this.setState({ loadingCmd: true });
        this.addLog(`Sending RemoteStopTransaction command for charger: ${selectedChargerId}...`);

        try {
            const res = await sendRemoteCommand(selectedChargerId, charger.backend, 'stop', { transactionId });
            if (res.success) {
                this.addLog(`[Success] RemoteStopTransaction sent successfully! ${res.simulated ? '(Simulated)' : ''}`);
                if (res.message) this.addLog(`Response message: ${res.message}`);
            } else {
                this.addLog(`[Error] Failed: ${res.error || 'Unknown error'}`);
            }
        } catch (error) {
            this.addLog(`[Error] HTTP request failed: ${error.message}`);
        } finally {
            this.setState({ loadingCmd: false });
            this.loadChargers(); // Refresh status immediately
        }
    }

    addLog(msg) {
        const timestamp = new Date().toLocaleTimeString();
        this.setState(prevState => ({
            logs: [...prevState.logs, `[${timestamp}] ${msg}`]
        }));
    }

    getStatusBadge(status) {
        const s = status ? status.toLowerCase() : '';
        switch(s) {
            case 'available':
            case 'online':
            case 'connected':
                return <Badge color="success">Online</Badge>;
            case 'preparing':
                return <Badge color="info">Preparing</Badge>;
            case 'charging':
                return <Badge color="danger">Charging</Badge>;
            case 'suspendeve':
            case 'suspendedevse':
            case 'suspended':
                return <Badge color="warning">Suspended</Badge>;
            case 'finishing':
                return <Badge color="warning">Finishing</Badge>;
            case 'reserved':
                return <Badge color="primary">Reserved</Badge>;
            case 'faulted':
                return <Badge color="danger">Faulted</Badge>;
            case 'unavailable':
            case 'offline':
            default:
                return <Badge color="secondary" className="text-secondary" style={{backgroundColor: '#e9ecef'}}>Offline</Badge>;
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
        const { selectedChargerId, activeChargers } = this.state;
        const selectedCharger = activeChargers.find(c => c.identity === selectedChargerId);

        return (
            <div className={s.root}>
                {/* Device Selector Card at the Top */}
                <div className="mb-4 d-flex justify-content-between align-items-center flex-wrap">
                    <div>
                        <h3>
                            Charger Station <span className="fw-semi-bold">Information</span>
                        </h3>
                        <p className="text-muted">Monitor telemetry and execute remote operations on real chargers.</p>
                    </div>
                    <div className="d-flex align-items-center mt-2 mt-md-0">
                        <Label for="charger-select" className="mr-2 mb-0 fw-semi-bold text-nowrap" style={{ fontSize: '1rem' }}>Selected Device:</Label>
                        <Input
                            id="charger-select"
                            type="select"
                            style={{ width: '260px' }}
                            value={selectedChargerId || ''}
                            onChange={(e) => this.setState({ selectedChargerId: e.target.value })}
                        >
                            <option value="">-- Mock Demo Station --</option>
                            {activeChargers.map(c => (
                                <option key={c.identity} value={c.identity}>{c.identity} ({c.backend})</option>
                            ))}
                        </Input>
                    </div>
                </div>

                {selectedCharger ? (
                    <Row>
                        {/* Left Column: Live Telemetry Widget */}
                        <Col lg={6} md={12} sm={12} className="mb-4">
                            <Widget
                                title={
                                    <h5>
                                        Live Charger <span className="fw-semi-bold">Details</span>
                                    </h5>
                                }
                            >
                                <div className="d-flex align-items-center mb-4 mt-3">
                                    <div className="mr-3" style={{ fontSize: '3rem', color: '#1870DC' }}>
                                        <FontAwesomeIcon icon={faChargingStation} />
                                    </div>
                                    <div>
                                        <h4 className="mb-1 fw-bold">{selectedCharger.identity}</h4>
                                        <div>
                                            <Badge color={selectedCharger.backend === 'SOAP' ? 'primary' : 'info'} className="mr-2">
                                                {selectedCharger.backend} Protocol
                                            </Badge>
                                            {this.getStatusBadge(selectedCharger.status)}
                                        </div>
                                    </div>
                                </div>

                                <Table className="table-bordered mt-3">
                                    <tbody>
                                        <tr>
                                            <td className="fw-semi-bold" style={{ width: '40%' }}>Vendor</td>
                                            <td>{selectedCharger.info?.chargePointVendor || 'Setec'}</td>
                                        </tr>
                                        <tr>
                                            <td className="fw-semi-bold">Model</td>
                                            <td>{selectedCharger.info?.chargePointModel || 'Setec SOAP'}</td>
                                        </tr>
                                        <tr>
                                            <td className="fw-semi-bold">Serial Number</td>
                                            <td>{selectedCharger.info?.chargeBoxSerialNumber || 'N/A'}</td>
                                        </tr>
                                        <tr>
                                            <td className="fw-semi-bold">IP Address</td>
                                            <td><code>{selectedCharger.ip || 'Local / NAT'}</code></td>
                                        </tr>
                                        <tr>
                                            <td className="fw-semi-bold">Last Heartbeat</td>
                                            <td>{selectedCharger.lastHeartbeat ? new Date(selectedCharger.lastHeartbeat).toLocaleTimeString() : 'Never'}</td>
                                        </tr>
                                    </tbody>
                                </Table>
                            </Widget>
                        </Col>

                        {/* Right Column: Remote Control Panel & Console Logs */}
                        <Col lg={6} md={12} sm={12} className="mb-4">
                            <Widget
                                title={
                                    <h5>
                                        Interactive <span className="fw-semi-bold">Remote Control</span>
                                    </h5>
                                }
                            >
                                <Row className="mb-3 mt-3">
                                    <Col md={6} className="mb-2 mb-md-0">
                                        <Label for="idTag-input" className="fw-semi-bold">RFID Auth idTag</Label>
                                        <Input
                                            id="idTag-input"
                                            type="text"
                                            value={this.state.idTag}
                                            onChange={(e) => this.setState({ idTag: e.target.value })}
                                        />
                                    </Col>
                                    <Col md={6}>
                                        <Label for="transId-input" className="fw-semi-bold">Transaction ID</Label>
                                        <Input
                                            id="transId-input"
                                            type="number"
                                            value={this.state.transactionId}
                                            onChange={(e) => this.setState({ transactionId: parseInt(e.target.value) || 1 })}
                                        />
                                    </Col>
                                </Row>

                                <div className="d-flex mb-4">
                                    <Button
                                        color="success"
                                        className="flex-fill mr-2"
                                        onClick={this.handleStartCharging}
                                        disabled={this.state.loadingCmd}
                                    >
                                        {this.state.loadingCmd ? 'Sending...' : 'Start Charging'}
                                    </Button>
                                    <Button
                                        color="danger"
                                        className="flex-fill"
                                        onClick={this.handleStopCharging}
                                        disabled={this.state.loadingCmd}
                                    >
                                        {this.state.loadingCmd ? 'Sending...' : 'Stop Charging'}
                                    </Button>
                                </div>

                                <Label className="fw-semi-bold">Live Execution Logs:</Label>
                                <div
                                    style={{
                                        backgroundColor: '#1E1E1E',
                                        color: '#00FF00',
                                        fontFamily: 'monospace',
                                        fontSize: '0.85rem',
                                        padding: '12px',
                                        borderRadius: '6px',
                                        height: '150px',
                                        overflowY: 'auto',
                                        whiteSpace: 'pre-wrap'
                                    }}
                                >
                                    {this.state.logs.map((log, i) => (
                                        <div key={i}>{log}</div>
                                    ))}
                                </div>
                            </Widget>
                        </Col>
                    </Row>
                ) : (
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
                            <h3>
                                Charging Station's <span className="fw-semi-bold">Live Information</span>
                            </h3>

                            <p>
                                Each row is highlighted. You will never lost there. Just{" "}
                                <code>.table-striped</code> it.
                            </p>


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
                                                    Add new Terminal.. <FontAwesomeIcon
                                                    icon={faChargingStation}> </FontAwesomeIcon>
                                                </Button>

                                                <Button color="default" className="mr-2" size="md">
                                                    Update Station.. <i className="fa fa-edit text-light"/>
                                                </Button>
                                            </div>
                                        </div>

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
                                                Current <span className="fw-semi-bold">Status</span>
                                            </h5>
                                        }

                                        refresh
                                        collapse
                                        close
                                    >

                                        <div>

                                            {/*<div className="terminalType">*/}
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
                                            {/*</div>*/}


                                            <br/>
                                            <br/>
                                            <h3>
                                                Terminal's <span className="fw-semi-bold">Live Information here..!</span>
                                            </h3>
                                            <p>
                                                {"Trace only what's really important. "}
                                                <code>.table-hover</code> is made for it.
                                            </p>


                                            {/*<div className="stationInfo">*/}

                                            <div className={s.overFlow}>
                                                <Table className="table-hover">
                                                    <thead>
                                                    <tr>
                                                        <th>#</th>
                                                        <th>Terminal No</th>
                                                        <th>Connector Type</th>
                                                        <th>CURRENT Status</th>
                                                    </tr>
                                                    </thead>
                                                    {/* eslint-disable */}
                                                    <tbody>
                                                    <tr>
                                                        <td>1</td>
                                                        <td><Link
                                                            to="/app/charging stations/Network Information/Chargers Station Information/Terminal Records">
                                                            <h7 className="fw-bold"> 001</h7>
                                                        </Link></td>
                                                        <td>CHAdeMo</td>
                                                        <td>
                                                            <Badge color="gray" className="text-secondary" pill>
                                                                Offline
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td>2</td>
                                                        <td><Link
                                                            to="/app/charging stations/Network Information/Chargers Station Information/Terminal Records">
                                                            <h7 className="fw-bold"> 002</h7>
                                                        </Link></td>
                                                        <td>CHAdeMo</td>
                                                        <td>
                                                            <Badge color="gray" className="text-secondary" pill>
                                                                Offline
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td>3</td>
                                                        <td><Link
                                                            to="/app/charging stations/Network Information/Chargers Station Information/Terminal Records">
                                                            <h7 className="fw-bold"> 003</h7>
                                                        </Link></td>
                                                        <td>CHAdeMo</td>
                                                        <td>
                                                            <Badge color="primary" className="text-secondary" pill>
                                                                New
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                    </tbody>
                                                    {/* eslint-enable */}

                                                </Table>
                                            </div>
                                            {/*</div>*/}
                                        </div>

                                    </Widget>
                                </Col>
                            </Row>

                        </Widget>
                    </Col>
                )}    </div>
        );
    }
}

export default StationInfoComponent;

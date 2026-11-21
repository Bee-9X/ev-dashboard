import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {Redirect, Route, Switch, withRouter} from 'react-router';
import {CSSTransition, TransitionGroup} from 'react-transition-group';
import Hammer from 'rc-hammerjs';

import UIIcons from '../../pages/components/icons';
import UINotifications from '../../pages/notifications';
import TablesStatic from '../../pages/tables/static';
import MapsGoogle from '../../pages/components/maps/google';
import CoreTypography from '../../pages/typography';
import Charts from '../../pages/components/charts/Charts';
import Dashboard from '../../pages/dashboard';
import ChargingStationsStatic from '../../pages/chargingStations/stationsStatic';
import TerminalRecords from '../../pages/chargingStations/Terminal/terminalRecords';
import NetworkInformation from '../../pages/chargingStations/Network/networkInfo';
import ChargersStationsInformation from "../../pages/chargingStations/ChargersStation/stationInfo";
import ChangePassword from "../../pages/User/ChangePassword";
import EditProfile from "../../pages/User/EditProfile";
import UserManagement from "../../pages/User/UserManagement";
import EVUserProfile from "../../pages/User/Management_Components/EVUserProfile";
import NetworkAccounts from "../../pages/Accounts/NetworkAccounts";
import NetworkAccData from "../../pages/Accounts/NetworkAccData";

import Header from '../Header';
import Sidebar from '../Sidebar';
import BreadcrumbHistory from '../BreadcrumbHistory';
import {closeSidebar, openSidebar} from '../../actions/navigation';
import s from './Layout.module.scss';

class Layout extends React.Component {
    static propTypes = {
        sidebarStatic: PropTypes.bool,
        sidebarOpened: PropTypes.bool,
        dispatch: PropTypes.func.isRequired,
    };

    static defaultProps = {
        sidebarStatic: false,
        sidebarOpened: false,
    };

    constructor(props) {
        super(props);

        this.handleSwipe = this.handleSwipe.bind(this);
    }


    handleSwipe(e) {
        if ('ontouchstart' in window) {
            if (e.direction === 4 && !this.state.chatOpen) {
                this.props.dispatch(openSidebar());
                return;
            }

            if (e.direction === 2 && this.props.sidebarOpened) {
                this.props.dispatch(closeSidebar());
                return;
            }

            this.setState({chatOpen: e.direction === 2});
        }
    }

    render() {
        return (
            <div
                className={[
                    s.root,
                    'sidebar-' + this.props.sidebarPosition,
                    'sidebar-' + this.props.sidebarVisibility,
                ].join(' ')}
            >
                <div className={s.wrap}>
                    <Header/>
                    {/*<Chat chatOpen={this.state.chatOpen} />*/}
                    {/*<Helper />*/}
                    <Sidebar/>
                    <Hammer onSwipe={this.handleSwipe}>
                        <main className={s.content}>
                            <BreadcrumbHistory url={this.props.location.pathname}/>
                            <TransitionGroup>
                                <CSSTransition
                                    key={this.props.location.key}
                                    classNames="fade"
                                    timeout={200}>

                                    <Switch>
                                        <Route path="/app/main" exact
                                               render={() => <Redirect to="/app/main/dashboard"/>}/>

                                        <Route path="/app/main/dashboard" exact component={Dashboard}/>
                                        <Route path="/app/accounts" exact component={NetworkAccounts}/>
                                        <Route path="/app/charging stations" exact component={ChargingStationsStatic}/>
                                        <Route path="/app/user/password" exact component={ChangePassword}/>
                                        <Route path="/app/user/my profile" exact component={EVUserProfile}/>
                                        <Route path="/app/user/edit profile" exact component={EditProfile}/>
                                        <Route path="/app/user/user management" exact component={UserManagement}/>
                                        <Route path="/app/user/user management/user profile" exact component={EVUserProfile}/>

                                        <Route path="/app/accounts/network accounts" exact component={NetworkAccData}/>


                                        <Route path="/app/charging stations/Network Information" exact
                                               component={NetworkInformation}/>
                                        <Route path="/app/charging stations/Chargers Station Information" exact
                                               component={ChargersStationsInformation}/>
                                        <Route path="/app/charging stations/Terminal Records" exact
                                               component={TerminalRecords}/>


                                        <Route
                                            path="/app/charging stations/Network Information/Chargers Station Information"
                                            exact component={ChargersStationsInformation}/>
                                        <Route
                                            path="/app/charging stations/Network Information/Chargers Station Information/Terminal Records"
                                            exact component={TerminalRecords}/>

                                        <Route path="/app/components/icons" exact component={UIIcons}/>
                                        <Route path="/app/components/notifications" exact component={UINotifications}/>
                                        <Route path="/app/components/charts" exact component={Charts}/>
                                        <Route path="/app/components/tables" exact component={TablesStatic}/>
                                        <Route path="/app/components/maps" exact component={MapsGoogle}/>
                                        <Route path="/app/components/typography" exact component={CoreTypography}/>
                                    </Switch>

                                </CSSTransition>
                            </TransitionGroup>
                            <footer className={s.contentFooter}>
                                {new Date().getFullYear()} &copy;
                                <a href="https://plugev.lk" rel="noopener noreferrer" target="_blank"> Plug-EV </a>
                                By- Bee-9X Innovations Lab
                            </footer>
                        </main>
                    </Hammer>
                </div>
            </div>
        );
    }
}

function mapStateToProps(store) {
    return {
        sidebarOpened: store.navigation.sidebarOpened,
        sidebarPosition: store.navigation.sidebarPosition,
        sidebarVisibility: store.navigation.sidebarVisibility,
    };
}

export default withRouter(connect(mapStateToProps)(Layout));

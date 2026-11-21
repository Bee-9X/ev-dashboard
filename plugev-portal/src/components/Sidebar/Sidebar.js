import React from 'react';
import cx from 'classnames';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Alert, Progress } from 'reactstrap';
import { withRouter } from 'react-router-dom';
import { dismissAlert } from '../../actions/alerts';
import s from './Sidebar.module.scss';
import LinksGroup from './LinksGroup';

import { changeActiveSidebarItem } from '../../actions/navigation';
import { logoutUser } from '../../actions/user';
import HomeIcon from '../Icons/SidebarIcons/HomeIcon';
import TypographyIcon from '../Icons/SidebarIcons/TypographyIcon';
import ComponentsIcon from '../Icons/SidebarIcons/ComponentsIcon';
import ChargingStationIcon from '../Icons/SidebarIcons/ChargingStationIcon';
import UserIcon from '../Icons/SidebarIcons/UserIcon';
import TopUpIcon from '../Icons/SidebarIcons/TopUpIcon';
import ChargingPlugIcon from '../Icons/SidebarIcons/ChargingPlugIcon';





class Sidebar extends React.Component {
    static propTypes = {
        sidebarStatic: PropTypes.bool,
        sidebarOpened: PropTypes.bool,
        dispatch: PropTypes.func.isRequired,
        activeItem: PropTypes.string,
        location: PropTypes.shape({
            pathname: PropTypes.string,
        }).isRequired,
    };

    static defaultProps = {
        sidebarStatic: false,
        activeItem: '',
    };

    constructor(props) {
        super(props);

        this.doLogout = this.doLogout.bind(this);
    }

    componentDidMount() {
        this.element.addEventListener('transitionend', () => {
            if (this.props.sidebarOpened) {
                this.element.classList.add(s.sidebarOpen);
            }
        }, false);
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.sidebarOpened !== this.props.sidebarOpened) {
            if (nextProps.sidebarOpened) {
                this.element.style.height = `${this.element.scrollHeight}px`;
            } else {
                this.element.classList.remove(s.sidebarOpen);
                setTimeout(() => {
                    this.element.style.height = '';
                }, 0);
            }
        }
    }

    dismissAlert(id) {
        this.props.dispatch(dismissAlert(id));
    }

    doLogout() {
        this.props.dispatch(logoutUser());
    }

    render() {
        return (
            <nav
                className={cx(s.root)}
                ref={(nav) => {
                    this.element = nav;
                }}
            >
                <header className={s.logo}>

                </header>


                <ul className={s.nav}>
                    <LinksGroup
                        onActiveSidebarItemChange={activeItem => this.props.dispatch(changeActiveSidebarItem(activeItem))}
                        activeItem={this.props.activeItem}
                        header="Dashboard"
                        isHeader
                        iconName={<HomeIcon className={s.menuIcon} />}
                        link="/app/main"
                        index="main"
                    />
                    <h5 className={[s.navTitle, s.groupTitle].join(' ')}>MANAGEMENT ARIA</h5>

                    <LinksGroup
                        onActiveSidebarItemChange={activeItem => this.props.dispatch(changeActiveSidebarItem(activeItem))}
                        activeItem={this.props.activeItem}
                        header="Accounts"
                        isHeader
                        iconName={<TypographyIcon className={s.menuIcon} />}
                        link="/app/accounts"
                        index="core"
                    />

                    <LinksGroup
                        onActiveSidebarItemChange={activeItem => this.props.dispatch(changeActiveSidebarItem(activeItem))}
                        activeItem={this.props.activeItem}
                        header="User"
                        isHeader
                        iconName={<UserIcon className={s.menuIcon} />}
                        link="/app/user"
                        index="user"
                        childrenLinks={[
                            {
                                header: 'User Management', link: '/app/user/user management',
                            },
                            {
                                header: 'My Profile', link: '/app/user/my profile',
                            },
                            {
                                header: 'Edit Profile', link: '/app/user/edit profile',
                            },
                            {
                                header: 'Change Password', link: '/app/user/password',
                            },

                        ]}
                    />

                    <LinksGroup
                        onActiveSidebarItemChange={t => this.props.dispatch(changeActiveSidebarItem(t))}
                        activeItem={this.props.activeItem}
                        header="Stations"
                        isHeader
                        iconName={<ChargingStationIcon className={s.menuIcon} />}
                        link="/app/charging stations"
                        index="ui"
                    />

                    {/* <LinksGroup
                        onActiveSidebarItemChange={activeItem => this.props.dispatch(changeActiveSidebarItem(activeItem))}
                        activeItem={this.props.activeItem}
                        header="Components"
                        isHeader
                        iconName={<ComponentsIcon className={s.menuIcon} />}
                        link="/app/components"
                        index="components"
                        childrenLinks={[
                            {
                                header: 'Charts', link: '/app/components/charts',
                            },
                            {
                                header: 'Icons', link: '/app/components/icons',
                            },
                            {
                                header: 'Maps', link: '/app/components/maps',
                            },
                            {
                                header: 'Typography', link: '/app/components/typography',
                            },
                            {
                                header: 'tables', link: '/app/components/tables',
                            },
                            {
                                header: 'Notifications', link: '/app/components/notifications',
                            },
                        ]}
                    /> */}

                    
                </ul>

                <h5 className={s.navTitle}>
                    ACTIVITY ARIA
                    {/* eslint-disable-next-line */}
                </h5>
                {/* eslint-disable */}
                
                <ul className={s.sidebarLabels}>
                    <li>
                        <a href="#">
                            <i className="fa fa-circle text-success mr-2" />
                            <span className={s.labelName}>{<TopUpIcon className={s.menuIcon} />} TopUp Accounts </span>
                        </a>
                    </li>
                    
                    <li>
                        <a href="#">
                            <i className="fa fa-circle text-primary mr-2" />
                            <span className={s.labelName}> {<ChargingPlugIcon className={s.menuIcon} />} Remote Start </span>
                        </a>
                    </li>
                    
                    <li>
                        <a href="#">
                            <i className="fa fa-circle text-danger mr-2" />
                            <span className={s.labelName}>My Recant Activity</span>
                        </a>
                    </li>
                </ul>
                {/* eslint-enable */}
                <h5 className={s.navTitle}>
                    PROJECTS
                </h5>
                <div className={s.sidebarAlerts}>
                    {this.props.alertsList.map(alert => // eslint-disable-line
                        <Alert
                            key={alert.id}
                            className={s.sidebarAlert}
                            color="transparent"
                            isOpen={true} // eslint-disable-line
                            toggle={() => {
                                this.dismissAlert(alert.id);
                            }}
                        >
                            <span>{alert.title}</span><br />
                            <Progress className={`bg-subtle-blue progress-xs mt-1`} color={alert.color}
                                value={alert.value} />
                            <span className={s.alertFooter}>{alert.footer}</span>
                        </Alert>,
                    )}
                </div>
            </nav>
        );
    }
}

function mapStateToProps(store) {
    return {
        sidebarOpened: store.navigation.sidebarOpened,
        sidebarStatic: store.navigation.sidebarStatic,
        alertsList: store.alerts.alertsList,
        activeItem: store.navigation.activeItem,
    };
}

export default withRouter(connect(mapStateToProps)(Sidebar));

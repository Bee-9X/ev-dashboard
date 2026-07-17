import React from 'react';
import PropTypes from 'prop-types';
import './Loader.css';
import cx from 'classnames';
import s from './Loader.module.scss';

class Loader extends React.Component {
    static propTypes = {
        size: PropTypes.number.isRequired
    };

    static defaultProps = {
        size: 21
    };


    render() {
        return (
            <div className={cx(s.root, this.props.className)}>
                {/*<i className="la la-spinner la-spin" style={{fontSize: this.props.size}}/>*/}

                <div className="lds-ellipsis">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
            </div>
        );
    }
}

export default Loader;

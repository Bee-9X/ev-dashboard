import React from 'react';

class HomeIcon extends React.Component {

    render() {
        return (
            <svg className={this.props.className} width="22" height="22" viewBox="0 0 100 100"
                 xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd"
                      d="M92,47.36,50,5,8,47.36A10.26,10.26,0,0,0,8,61.87l2.44,2.44,6.73-6.73V95H82.8V57.56l6.75,6.75L92,61.87a10.26,10.26,0,0,0,0-14.51ZM41.38,92.19V63.72H58.54V92.19Zm38.62,0H61.35V60.91H38.56V92.19H20V54.76L50,24.48,80,54.74ZM90,59.88l-.45.45L50,20.48,10.44,60.33,10,59.88a7.45,7.45,0,0,1,0-10.53L50,9,90,49.35a7.45,7.45,0,0,1,0,10.53Z"/>
                <mask id="home" mask-type="alpha" maskUnits="userSpaceOnUse" x="2" y="1" width="16" height="18">
                    <path fillRule="evenodd" clipRule="evenodd"
                          d="M92,47.36,50,5,8,47.36A10.26,10.26,0,0,0,8,61.87l2.44,2.44,6.73-6.73V95H82.8V57.56l6.75,6.75L92,61.87a10.26,10.26,0,0,0,0-14.51ZM41.38,92.19V63.72H58.54V92.19Zm38.62,0H61.35V60.91H38.56V92.19H20V54.76L50,24.48,80,54.74ZM90,59.88l-.45.45L50,20.48,10.44,60.33,10,59.88a7.45,7.45,0,0,1,0-10.53L50,9,90,49.35a7.45,7.45,0,0,1,0,10.53Z"/>
                </mask>
                <g mask="url(#home)">
                    <rect width="22" height="22"/>
                </g>
            </svg>
        );
    }
}

export default HomeIcon;

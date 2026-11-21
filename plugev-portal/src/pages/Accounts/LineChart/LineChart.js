import React from "react";
import {withRouter} from 'react-router-dom';

import s from "../../components/charts/Charts.module.scss";
import {chartData} from "./LineChartData";
import echarts from "echarts/lib/echarts";
import ReactEchartsCore from "echarts-for-react/lib/core";


class LineChartComponent extends React.Component {

    state = {
        cd: chartData,
        initEchartsOptions: {
            renderer: "canvas",
        },
    };

    render() {
        const {cd, initEchartsOptions} = this.state;
        return (
            <div className={s.root}>
                <h3>
                    {/*Charging Station's <span className="fw-semi-bold">Live Information</span>*/}
                </h3>

                <ReactEchartsCore
                    echarts={echarts}
                    option={cd.echarts.line}
                    opts={initEchartsOptions}
                    style={{height: "400px"}}
                />

            </div>
        );
    }
}

export default withRouter(LineChartComponent);
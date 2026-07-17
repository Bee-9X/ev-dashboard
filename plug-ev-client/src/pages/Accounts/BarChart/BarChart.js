import React from "react";
import {withRouter} from 'react-router-dom';
import ApexChart from "react-apexcharts";

import s from "../../components/charts/Charts.module.scss";
import {chartData} from "./BarChartData";


class BarChartComponent extends React.Component {

    state = {
        cd: chartData,
        initEchartsOptions: {
            renderer: "canvas",
        },
    };

    render() {
        const {cd} = this.state;
        return (
            <div className={s.root}>
                <h3>
                    {/*Charging Station's <span className="fw-semi-bold">Live Information</span>*/}
                </h3>

                <ApexChart
                    className="sparkline-chart"
                    height={350}
                    series={cd.apex.column.series}
                    options={cd.apex.column.options}
                    type={"bar"}
                />

            </div>
        );
    }
}

export default withRouter(BarChartComponent);
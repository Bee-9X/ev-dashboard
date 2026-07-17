import React from "react";
import {withRouter} from 'react-router-dom';
import ApexChart from "react-apexcharts";

import s from "../../components/charts/Charts.module.scss";
import {chartData} from "./PieChartData";


class PieChartComponent extends React.Component {

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
                    type={"pie"}
                    height={380}
                    series={cd.apex.pie.series}
                    options={cd.apex.pie.options}
                />

            </div>
        );
    }
}

export default withRouter(PieChartComponent);
import config from "./config";

const colors = config.chartColors;
let lineColors = [colors.blue, colors.green, colors.orange];

export const chartData = {

    echarts: {
        line: {
            color: lineColors,
            tooltip: {
                trigger: "none",
                axisPointer: {
                    type: "cross",
                },
            },
            legend: {
                data: ["2015 Precipitation", "2016 Precipitation"],
                textStyle: {
                    color: colors.textColor,
                },
            },
            grid: {
                top: 70,
                bottom: 50,
            },
            xAxis: [
                {
                    type: "category",
                    axisTick: {
                        alignWithLabel: true,
                    },
                    axisLine: {
                        onZero: false,
                        lineStyle: {
                            color: lineColors[1],
                        },
                    },
                    axisPointer: {
                        label: {
                            formatter: function (params) {
                                return (
                                    "Precipitation  " +
                                    params.value +
                                    (params.seriesData.length
                                        ? "：" + params.seriesData[0].data
                                        : "")
                                );
                            },
                        },
                    },
                    data: [
                        "2020-1",
                        "2020-2",
                        "2020-3",
                        "2020-4",
                        "2020-5",
                        "2020-6",
                        "2020-7",
                        "2020-8",
                        "2020-9",
                        "2020-10",
                        "2020-11",
                        "2020-12",
                    ],
                },
                {
                    type: "category",
                    axisTick: {
                        alignWithLabel: true,
                    },
                    axisLine: {
                        onZero: false,
                        lineStyle: {
                            color: lineColors[0],
                        },
                    },
                    axisPointer: {
                        label: {
                            formatter: function (params) {
                                return (
                                    "Precipitation  " +
                                    params.value +
                                    (params.seriesData.length
                                        ? "：" + params.seriesData[0].data
                                        : "")
                                );
                            },
                        },
                    },
                    data: [
                        "2019-1",
                        "2019-2",
                        "2019-3",
                        "2019-4",
                        "2019-5",
                        "2019-6",
                        "2019-7",
                        "2019-8",
                        "2019-9",
                        "2019-10",
                        "2019-11",
                        "2019-12",
                    ],
                },
            ],
            yAxis: [
                {
                    type: "value",
                    axisLabel: {
                        color: colors.textColor,
                    },
                    axisLine: {
                        lineStyle: {
                            color: colors.textColor,
                        },
                    },
                    splitLine: {
                        lineStyle: {
                            color: colors.gridLineColor,
                        },
                    },
                    axisPointer: {
                        label: {
                            color: colors.dark,
                        },
                    },
                },
            ],
            series: [
                {
                    name: "2015 Precipitation",
                    type: "line",
                    xAxisIndex: 1,
                    smooth: true,
                    data: [
                        2.6,
                        5.9,
                        9.0,
                        26.4,
                        28.7,
                        70.7,
                        175.6,
                        182.2,
                        48.7,
                        18.8,
                        6.0,
                        2.3,
                    ],
                },
                {
                    name: "2016 Precipitation",
                    type: "line",
                    smooth: true,
                    data: [
                        3.9,
                        5.9,
                        11.1,
                        18.7,
                        48.3,
                        69.2,
                        231.6,
                        46.6,
                        55.4,
                        18.4,
                        10.3,
                        0.7,
                    ],
                },
            ],
        },
    },
};



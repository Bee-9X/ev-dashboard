import config from "./config";

const colors = config.chartColors;

let columnColors = [
    colors.blue,
    colors.green,
    colors.orange,
    colors.red,
    colors.default,
    colors.gray,
    colors.teal,
    colors.pink,
];

export const chartData = {
    apex: {
        column: {
            series: [
                {
                    data: [21, 22, 10, 28, 16, 21, 50],
                },
            ],
            options: {
                chart: {
                    height: 350,
                    type: "bar",
                },
                legend: {
                    show: true,
                    labels: {
                        colors: colors.textColor,
                    },
                    itemMargin: {
                        horizontal: 10,
                        vertical: 5
                    },
                },
                colors: columnColors,
                plotOptions: {
                    bar: {
                        columnWidth: "45%",
                        distributed: true,
                    },
                },
                dataLabels: {
                    enabled: false,
                },
                xaxis: {
                    categories: [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                    ],
                    labels: {
                        style: {
                            colors: columnColors,
                            fontSize: "14px",
                        },
                    },
                    axisBorder: {
                        show: false,
                    },
                    axisTicks: {
                        show: false,
                    },
                },
                yaxis: {
                    labels: {
                        style: {
                            color: colors.textColor,
                        },
                    },
                },
                tooltip: {
                    theme: "dark",
                },
                grid: {
                    borderColor: colors.gridLineColor,
                },
            },
        },
    },
};


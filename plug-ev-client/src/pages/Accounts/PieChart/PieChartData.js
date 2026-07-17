import config from "./config";

const colors = config.chartColors;

export const chartData = {
    apex: {

        pie: {
            series: [21, 22, 10, 28, 16, 21, 50],
            options: {
                labels: [
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                ],
                theme: {
                    monochrome: {
                        enabled: true,
                        color: colors.green,
                    },
                },
                stroke: {
                    show: false,
                    width: 0,
                },
                legend: false,
                responsive: [
                    {
                        breakpoint: 480,
                        options: {
                            chart: {
                                width: 200,
                            },
                            legend: {
                                position: "bottom",
                            },
                        },
                    },
                ],
            },
        },
    },
};

import React from "react";
import { Table, } from "reactstrap";

import s from "../../tables/static/Static.module.scss";
import ss from "../../dashboard/Dashboard.module.scss";
import { Link } from "react-router-dom";


class EVUsersComponent extends React.Component {

    render() {

        return (
            <div className={s.root}>
                {/*______________________________________For search____________________________*/}
                <div className="input-group mt">
                    <input
                        type="text"
                        className="form-control bg-custom-dark border-0"
                        placeholder="Search"
                    />
                    <span className="input-group-btn">
                        <button
                            type="submit"
                            className={`btn btn-subtle-blue ${ss.searchBtn}`}
                        >
                            <i className="fa fa-search text-light" />
                        </button>
                    </span>
                </div>

                {/*______________________________________For Table____________________________*/}

                <div className={`widget-table-overflow ${s.overFlow}`}>

                    <Table className="table-striped table-lg mt-lg mb-0">
                        <thead>
                        <tr>
                            <th>User identity</th>
                            <th className="text-right">Name</th>
                            <th className="text-right">Phone number</th>
                            <th className="text-right">Email</th>
                            <th className="text-right">ACC Balance</th>
                            <th className="text-right">Total Charged Power</th>
                            <th className="text-right">Last Charged time</th>
                        </tr>
                        </thead>

                        <tbody>


                        <tr>
                            <th> 0000001</th>
                            <th className="text-right"><Link to="/app/user/user management/user profile"> Madhusara
                                Ariyawansha </Link></th>
                            <th className="text-right">0714567899</th>
                            <th className="text-right">abc@cdf.com</th>
                            <th className="text-right">10000</th>
                            <th className="text-right">15.00 kW h</th>
                            <th className="text-right">January 02, 2022 9.05AM</th>

                        </tr>

                        <tr>
                            <th> 0000002</th>
                            <th className="text-right">Buddhi Nisansala</th>
                            <th className="text-right">0714567899</th>
                            <th className="text-right">abc@cdf.com</th>
                            <th className="text-right">10000</th>
                            <th className="text-right">15.00 kW h</th>
                            <th className="text-right">January 02, 2022 9.05AM</th>

                        </tr>

                        <tr>
                            <th> 0000003</th>
                            <th className="text-right">Krishantha Dinesh</th>
                            <th className="text-right">0714567899</th>
                            <th className="text-right">abc@cdf.com</th>
                            <th className="text-right">10000</th>
                            <th className="text-right">15.00 kW h</th>
                            <th className="text-right">January 02, 2022 9.05AM</th>

                        </tr>

                        <tr>
                            <th> 0000004</th>
                            <th className="text-right">Lahiru Shavishka</th>
                            <th className="text-right">0714567899</th>
                            <th className="text-right">abc@cdf.com</th>
                            <th className="text-right">10000</th>
                            <th className="text-right">15.00 kW h</th>
                            <th className="text-right">January 02, 2022 9.05AM</th>

                        </tr>


                        </tbody>
                    </Table>
                </div>
            </div>
        );


    }
}

export default EVUsersComponent;

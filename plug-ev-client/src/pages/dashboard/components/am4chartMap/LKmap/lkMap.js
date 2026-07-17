import React from "react";
import LkMapSVG from "./LK-LocationMap.svg";
import mapShadow from "./map-shadow.png"
import './lKMapStyle.css';
import s from "../../../Dashboard.module.scss";
import { fetchAllChargers } from "../../../../../api";
import $ from 'jquery';



const districtsData = [
    { id: '1432', name: 'Ampara' },
    { id: '1452', name: 'Anuradhapura' },
    { id: '1475', name: 'Badulla' },
    { id: '1491', name: 'Batticaloa' },
    { id: '1506', name: 'Colombo' },
    { id: '1559', name: 'Galle' },
    { id: '1577', name: 'Gampaha' },
    { id: '1592', name: 'Hambantota' },
    { id: '1605', name: 'Jaffna' },
    { id: '1620', name: 'Kalutara' },
    { id: '1636', name: 'Kandy' },
    { id: '1658', name: 'Kegalle' },
    { id: '1670', name: 'Kilinochchi' },
    { id: '1674', name: 'Kurunegala' },
    { id: '1706', name: 'Mannar' },
    { id: '1712', name: 'Matale' },
    { id: '1724', name: 'Matara' },
    { id: '1740', name: 'Monaragala' },
    { id: '1752', name: 'Mullativu' },
    { id: '1757', name: 'Nuwara Eliya' },
    { id: '1763', name: 'Polonnaruwa' },
    { id: '1771', name: 'Puttalam' },
    { id: '1788', name: 'Ratnapura' },
    { id: '1806', name: 'Trincomalee' },
    { id: '1818', name: 'Vavuniya' }
];

class LkMapComponent extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            searchQuery: '',
            chargers: [],
            selectedDistrict: null
        };
        this.objectRef = React.createRef();
    }

    async componentDidMount() {
        await this.loadChargers();
        // Refresh every 10 seconds to get live status
        this.interval = setInterval(() => this.loadChargers(), 10000);
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevState.chargers !== this.state.chargers || prevState.selectedDistrict !== this.state.selectedDistrict) {
            this.updateMapVisuals();
        }
    }

    componentWillUnmount() {
        if (this.interval) clearInterval(this.interval);
    }

    updateMapVisuals() {
        if (!this.objectRef.current) return;
        const svgDoc = this.objectRef.current.contentDocument;
        if (!svgDoc) return;

        const { chargers, selectedDistrict } = this.state;
        
        // Reset all regions to default
        const regions = svgDoc.querySelectorAll('.region');
        regions.forEach(region => {
            region.style.fill = ''; 
        });

        // 1. Color districts that have chargers
        chargers.forEach(c => {
            const distObj = districtsData.find(d => d.name === c.district);
            if (distObj) {
                const region = svgDoc.querySelector(`.region[data-id="${distObj.id}"]`);
                if (region) {
                    // Green for Available, Yellow/Orange for Charging/Offline
                    region.style.fill = c.status === 'Available' ? 'rgba(40, 167, 69, 0.7)' : 'rgba(255, 193, 7, 0.7)';
                }
            }
        });

        // 2. Highlight selected district strongly
        if (selectedDistrict) {
            const distObj = districtsData.find(d => d.name === selectedDistrict);
            if (distObj) {
                const region = svgDoc.querySelector(`.region[data-id="${distObj.id}"]`);
                if (region) {
                    region.style.fill = 'rgba(24, 70, 236, 0.8)';
                }
            }
        }
    }

    async loadChargers() {
        try {
            const data = await fetchAllChargers();
            this.setState({ chargers: data });
        } catch (error) {
            console.error("Failed to load chargers for map", error);
        }
    }

    handleSearchChange = (e) => {
        this.setState({ searchQuery: e.target.value });
    }

    render() {
        const { searchQuery, chargers, selectedDistrict } = this.state;
        
        // Use the standard district list, plus 'Unknown' if there are unregistered chargers
        const allDistricts = districtsData.map(d => d.name);
        if (chargers.some(c => c.district === 'Unknown')) {
            allDistricts.push('Unknown');
        }
        const activeDistricts = Array.from(new Set(allDistricts));
        
        // Filter chargers based on search and selected district
        const displayedChargers = chargers.filter(c => {
            if (selectedDistrict && c.district !== selectedDistrict) return false;
            if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
                !(c.district && c.district.toLowerCase().includes(searchQuery.toLowerCase()))) {
                return false;
            }
            return true;
        });

        return (
            <div className="home-locations">
                <div className="home-map">
                    <object ref={this.objectRef} aria-label="Sri Lanka Map" type="image/svg+xml" data={LkMapSVG} onLoad={() => this.updateMapVisuals()}/>
                    <img className="mapShadow" src={mapShadow} alt="Map Shadow" />
                    <div className="map-info">
                        {/*for search*/}
                        <div className="input-group mt">
                            <input
                                type="text"
                                className="form-control bg-custom-dark border-0"
                                placeholder="Search Chargers or District..."
                                value={searchQuery}
                                onChange={this.handleSearchChange}
                            />
                            <span className="input-group-btn">
                                <button
                                    type="button"
                                    className={`btn btn-subtle-blue ${s.searchBtn}`}
                                >
                                    <i className="fa fa-search text-light"/>
                                </button>
                            </span>
                        </div>
                        {selectedDistrict && (
                            <div className="mt-2">
                                <span className="badge badge-primary mr-2">Filtering: {selectedDistrict}</span>
                                <a href="#" onClick={(e) => { e.preventDefault(); this.setState({ selectedDistrict: null }); }} className="text-danger text-sm">Clear Filter</a>
                            </div>
                        )}
                    </div>
                </div>
                <div className="districtsList" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <div className="home-group is-region">
                        <h2>Filter by District</h2>
                        <select 
                            className="form-control bg-custom-dark text-light mb-4" 
                            value={selectedDistrict || ""}
                            onChange={(e) => this.setState({ selectedDistrict: e.target.value || null })}
                        >
                            <option value="">All Districts</option>
                            {activeDistricts.map(district => (
                                <option key={district} value={district}>{district}</option>
                            ))}
                        </select>

                        <h2>Live Chargers ({displayedChargers.length})</h2>
                        <ul className="locations">
                            {displayedChargers.map(charger => (
                                <li key={charger.identity}>
                                    <a href="#">
                                        <strong>{charger.name}</strong> 
                                        <br/>
                                        <small className="text-muted">{charger.district} - Status: <span className={charger.status === 'Available' ? 'text-success' : 'text-warning'}>{charger.status}</span></small>
                                    </a>
                                </li>
                            ))}
                            {displayedChargers.length === 0 && <li>No chargers found.</li>}
                        </ul>
                    </div>
                </div>
            </div>
        );
    }
};

export default LkMapComponent;
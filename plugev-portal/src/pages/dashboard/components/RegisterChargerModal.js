import React, { useState } from 'react';
import { Button, Modal, ModalHeader, ModalBody, ModalFooter, Form, FormGroup, Label, Input, Alert } from 'reactstrap';
import { registerCharger } from '../../../api';

const RegisterChargerModal = ({ isOpen, toggle, onRegisterSuccess }) => {
    const [identity, setIdentity] = useState('');
    const [name, setName] = useState('');
    const [district, setDistrict] = useState('Colombo');
    const [ocppVersion, setOcppVersion] = useState('1.5 SOAP');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    // Common Sri Lankan districts
    const districts = [
        'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha', 'Hambantota', 
        'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 
        'Matara', 'Monaragala', 'Mullativu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura', 
        'Trincomalee', 'Vavuniya'
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await registerCharger(identity, name, district, ocppVersion);
            setIdentity('');
            setName('');
            setDistrict('Colombo');
            setOcppVersion('1.5 SOAP');
            if (onRegisterSuccess) onRegisterSuccess();
            toggle();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} toggle={toggle}>
            <ModalHeader toggle={toggle}>Register New Charger</ModalHeader>
            <Form onSubmit={handleSubmit}>
                <ModalBody>
                    {error && <Alert color="danger">{error}</Alert>}
                    <FormGroup>
                        <Label for="identity">ChargeBox Identity (e.g., c1)</Label>
                        <Input 
                            type="text" 
                            name="identity" 
                            id="identity" 
                            value={identity} 
                            onChange={(e) => setIdentity(e.target.value)} 
                            required 
                            placeholder="Must match the identity sent by the charger"
                        />
                    </FormGroup>
                    <FormGroup>
                        <Label for="name">Friendly Name</Label>
                        <Input 
                            type="text" 
                            name="name" 
                            id="name" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            required 
                            placeholder="e.g., Office Parking Charger"
                        />
                    </FormGroup>
                    <FormGroup>
                        <Label for="district">District Location</Label>
                        <Input 
                            type="select" 
                            name="district" 
                            id="district" 
                            value={district} 
                            onChange={(e) => setDistrict(e.target.value)}
                        >
                            {districts.map(d => <option key={d} value={d}>{d}</option>)}
                        </Input>
                    </FormGroup>
                    <FormGroup>
                        <Label for="ocppVersion">OCPP Protocol Version</Label>
                        <Input 
                            type="select" 
                            name="ocppVersion" 
                            id="ocppVersion" 
                            value={ocppVersion} 
                            onChange={(e) => setOcppVersion(e.target.value)}
                        >
                            <option value="1.5 SOAP">1.5 SOAP</option>
                            <option value="1.6 SOAP">1.6 SOAP</option>
                            <option value="1.6 JSON">1.6 JSON (WebSocket)</option>
                        </Input>
                    </FormGroup>
                </ModalBody>
                <ModalFooter>
                    <Button color="primary" type="submit" disabled={loading}>
                        {loading ? 'Registering...' : 'Register Charger'}
                    </Button>{' '}
                    <Button color="secondary" onClick={toggle}>Cancel</Button>
                </ModalFooter>
            </Form>
        </Modal>
    );
};

export default RegisterChargerModal;

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract AccessControl {
    struct AccessGrant {
        address patient;
        address doctor;
        string documentCid;   // encrypted file CID
        string encryptedCid;   // ciphertext CID (for proxy)
        uint256 expiryTime;
        bool isActive;
    }

    mapping(address => AccessGrant[]) public patientGrants;
    mapping(address => AccessGrant[]) public doctorGrants;

    event AccessGranted(address indexed patient, address indexed doctor, string documentCid, uint256 expiryTime);
    event AccessRevoked(address indexed patient, address indexed doctor, string documentCid);

    // Grant access to a doctor
    function grantAccess(
        address _doctor,
        string memory _documentCid,
        string memory _encryptedCid,
        uint256 _expiryTime
    ) public {
        require(_expiryTime > block.timestamp, "Expiry must be future");
        AccessGrant memory grant = AccessGrant({
            patient: msg.sender,
            doctor: _doctor,
            documentCid: _documentCid,
            encryptedCid: _encryptedCid,
            expiryTime: _expiryTime,
            isActive: true
        });
        patientGrants[msg.sender].push(grant);
        doctorGrants[_doctor].push(grant);
        emit AccessGranted(msg.sender, _doctor, _documentCid, _expiryTime);
    }

    // Revoke access (only patient)
    function revokeAccess(address _doctor, string memory _documentCid) public {
        AccessGrant[] storage grants = patientGrants[msg.sender];
        for (uint i = 0; i < grants.length; i++) {
            if (grants[i].doctor == _doctor && 
                keccak256(bytes(grants[i].documentCid)) == keccak256(bytes(_documentCid))) {
                grants[i].isActive = false;
                break;
            }
        }
        // Also update doctorGrants (optional)
        emit AccessRevoked(msg.sender, _doctor, _documentCid);
    }

    // Get all active grants for a doctor
    function getDoctorAccesses(address _doctor) public view returns (AccessGrant[] memory) {
        return doctorGrants[_doctor];
    }
}
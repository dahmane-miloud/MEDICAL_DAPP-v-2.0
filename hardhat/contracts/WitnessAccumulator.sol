// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract WitnessAccumulator {
    struct Doctor {
        string witnessHash;
        uint256 witnessExpiry;
        bool isActive;
        uint256 registeredAt;
    }

    mapping(string => Doctor) public doctors;
    mapping(string => bool) public revokedDoctors;
    address public healthDepartment;
    uint256 public accumulator;

    event WitnessIssued(string indexed did, string witnessHash, uint256 expiry);
    event WitnessUpdated(string indexed did, string newWitnessHash, uint256 newExpiry);
    event DoctorRevoked(string indexed did, uint256 newAccumulator);

    modifier onlyHealthDepartment() {
        require(msg.sender == healthDepartment, "Only health department");
        _;
    }

    constructor() {
        healthDepartment = msg.sender;
    }

    // ---------- Core functions (unchanged logic) ----------
    function issueWitness(
        string memory _did,
        string memory _witnessHash,
        uint256 _witnessExpiry
    ) public onlyHealthDepartment {
        require(_witnessExpiry > block.timestamp, "Expiry must be future");
        // Allow re-issuance but reset active status
        bool wasActive = doctors[_did].isActive;
        doctors[_did] = Doctor(_witnessHash, _witnessExpiry, true, block.timestamp);
        // Update accumulator only if it's a new doctor (not previously active)
        if (!wasActive) {
            accumulator ^= uint256(keccak256(abi.encodePacked(_did)));
        }
        emit WitnessIssued(_did, _witnessHash, _witnessExpiry);
    }

    function revokeDoctor(string memory _did) public onlyHealthDepartment {
        require(doctors[_did].registeredAt != 0, "Doctor not found");
        require(doctors[_did].isActive, "Already revoked");
        doctors[_did].isActive = false;
        revokedDoctors[_did] = true;
        accumulator ^= uint256(keccak256(abi.encodePacked(_did)));
        emit DoctorRevoked(_did, accumulator);
    }

    // ---------- View functions ----------
    function isDoctorActive(string memory _did) public view returns (bool) {
        Doctor memory doc = doctors[_did];
        return doc.isActive && doc.witnessExpiry > block.timestamp;
    }

    function getDoctorWitness(string memory _did) public view returns (string memory, uint256) {
        require(doctors[_did].registeredAt != 0, "Doctor not found");
        return (doctors[_did].witnessHash, doctors[_did].witnessExpiry);
    }

    // ---------- NEW helper functions (fix your error) ----------
    
    /// @dev Returns true if the doctor exists (registered via issueWitness)
    function doctorExists(string memory _did) public view returns (bool) {
        return doctors[_did].registeredAt != 0;
    }

    /// @dev Returns full doctor info without reverting (useful for UI)
    function getDoctorInfo(string memory _did)
        public
        view
        returns (
            string memory witnessHash,
            uint256 witnessExpiry,
            bool isActive,
            uint256 registeredAt,
            bool exists
        )
    {
        Doctor memory doc = doctors[_did];
        exists = doc.registeredAt != 0;
        return (doc.witnessHash, doc.witnessExpiry, doc.isActive, doc.registeredAt, exists);
    }

    /// @dev Update witness hash and/or expiry without affecting accumulator
    function updateWitness(
        string memory _did,
        string memory _newWitnessHash,
        uint256 _newExpiry
    ) public onlyHealthDepartment {
        require(doctors[_did].registeredAt != 0, "Doctor not found");
        require(_newExpiry > block.timestamp, "Expiry must be future");
        doctors[_did].witnessHash = _newWitnessHash;
        doctors[_did].witnessExpiry = _newExpiry;
        // Do NOT change accumulator – doctor still same identity
        emit WitnessUpdated(_did, _newWitnessHash, _newExpiry);
    }

    /// @dev Get current accumulator value (already public, but adding explicit getter for clarity)
    function getAccumulator() public view returns (uint256) {
        return accumulator;
    }
}
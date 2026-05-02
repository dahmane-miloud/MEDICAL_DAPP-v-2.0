// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Accumulator
 * @dev Uses accumulator pattern - witness is a single hash value that aggregates all doctor statuses
 */
contract Accumulator {
    // ============ STRUCTURES ============
    
    struct DoctorEntry {
        bytes32 witnessHash;
        uint64 expiryTime;
        uint32 index;
        bool isActive;
    }
    
    // ============ STORAGE ============
    
    bytes32 public witnessAccumulator;
    mapping(bytes32 => DoctorEntry) public doctorEntries;
    uint256 public activeDoctorCount;
    mapping(address => bool) public healthDepartments;
    address public owner;
    
    // ============ EVENTS ============
    
    event WitnessAccumulatorUpdated(bytes32 newAccumulator, uint256 blockNumber);
    event DoctorWitnessSet(bytes32 indexed doctorIdHash, bytes32 witnessHash, uint64 expiryTime);
    event DoctorRevoked(bytes32 indexed doctorIdHash);
    event HealthDepartmentAdded(address indexed dept);
    event HealthDepartmentRemoved(address indexed dept);
    
    // ============ MODIFIERS ============
    
    modifier onlyHealthDepartment() {
        require(healthDepartments[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    // ============ CONSTRUCTOR ============
    
    constructor() {
        owner = msg.sender;
        healthDepartments[msg.sender] = true;
        witnessAccumulator = bytes32(0);
        activeDoctorCount = 0;
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    function addHealthDepartment(address dept) external onlyOwner {
        healthDepartments[dept] = true;
        emit HealthDepartmentAdded(dept);
    }
    
    function removeHealthDepartment(address dept) external onlyOwner {
        healthDepartments[dept] = false;
        emit HealthDepartmentRemoved(dept);
    }
    
    // ============ CORE FUNCTIONS ============
    
    function setDoctorWitness(
        string memory doctorDid,
        bytes32 witnessHash,
        uint64 expiryTime
    ) external onlyHealthDepartment {
        require(expiryTime > block.timestamp, "Expiry must be in future");
        require(bytes(doctorDid).length > 0, "Doctor DID required");
        
        bytes32 doctorIdHash = keccak256(bytes(doctorDid));
        DoctorEntry storage entry = doctorEntries[doctorIdHash];
        
        // Remove old witness contribution from accumulator
        if (entry.isActive) {
            witnessAccumulator = witnessAccumulator ^ entry.witnessHash;
            activeDoctorCount--;
        }
        
        // Store new witness
        entry.witnessHash = witnessHash;
        entry.expiryTime = expiryTime;
        entry.isActive = true;
        entry.index = uint32(activeDoctorCount + 1);
        
        // XOR in the new value to accumulator
        witnessAccumulator = witnessAccumulator ^ witnessHash;
        activeDoctorCount++;
        
        emit WitnessAccumulatorUpdated(witnessAccumulator, block.number);
        emit DoctorWitnessSet(doctorIdHash, witnessHash, expiryTime);
    }
    
    function revokeDoctor(string memory doctorDid) external onlyHealthDepartment {
        bytes32 doctorIdHash = keccak256(bytes(doctorDid));
        DoctorEntry storage entry = doctorEntries[doctorIdHash];
        
        require(entry.isActive, "Doctor not active");
        
        // XOR out the value from accumulator
        witnessAccumulator = witnessAccumulator ^ entry.witnessHash;
        activeDoctorCount--;
        
        entry.isActive = false;
        
        emit WitnessAccumulatorUpdated(witnessAccumulator, block.number);
        emit DoctorRevoked(doctorIdHash);
    }
    
    // ============ VIEW FUNCTIONS ============
    
    function getCurrentAccumulator() external view returns (bytes32, uint256, uint256) {
        return (witnessAccumulator, activeDoctorCount, block.number);
    }
    
    function isDoctorActive(string memory doctorDid) external view returns (bool) {
        bytes32 doctorIdHash = keccak256(bytes(doctorDid));
        DoctorEntry storage entry = doctorEntries[doctorIdHash];
        return entry.isActive && entry.expiryTime > block.timestamp;
    }
    
    function getDoctorWitness(string memory doctorDid) external view returns (bytes32, uint64, bool) {
        bytes32 doctorIdHash = keccak256(bytes(doctorDid));
        DoctorEntry storage entry = doctorEntries[doctorIdHash];
        return (entry.witnessHash, entry.expiryTime, entry.isActive);
    }
}
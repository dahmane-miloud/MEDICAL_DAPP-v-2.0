const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DoctorRegistry", function() {
    let doctorRegistry;
    let owner;
    let addr1;

    beforeEach(async function() {
        [owner, addr1] = await ethers.getSigners();

        const DoctorRegistry = await ethers.getContractFactory("DoctorRegistry");
        doctorRegistry = await DoctorRegistry.deploy();
        await doctorRegistry.waitForDeployment();
    });

    describe("Deployment", function() {
        it("Should set the right owner", async function() {
            expect(await doctorRegistry.healthDepartment()).to.equal(owner.address);
        });
    });

    describe("Doctor Registration", function() {
        it("Should register a new doctor", async function() {
            const did = "did:ethr:123";
            const publicKey = "pubkey123";
            const name = "Dr. Smith";
            const license = "LIC123";
            const specialization = "Cardiology";

            await doctorRegistry.registerDoctor(did, publicKey, name, license, specialization);

            const doctor = await doctorRegistry.doctors(did);
            expect(doctor.name).to.equal(name);
            expect(doctor.isActive).to.be.true;
        });

        it("Should not allow non-owner to register", async function() {
            const did = "did:ethr:123";
            const publicKey = "pubkey123";
            const name = "Dr. Smith";
            const license = "LIC123";
            const specialization = "Cardiology";

            await expect(
                doctorRegistry.connect(addr1).registerDoctor(did, publicKey, name, license, specialization)
            ).to.be.revertedWith("Only health department can call this");
        });
    });

    describe("Doctor Revocation", function() {
        it("Should revoke a doctor", async function() {
            const did = "did:ethr:123";
            const publicKey = "pubkey123";
            const name = "Dr. Smith";
            const license = "LIC123";
            const specialization = "Cardiology";

            await doctorRegistry.registerDoctor(did, publicKey, name, license, specialization);
            await doctorRegistry.revokeDoctor(did);

            const doctor = await doctorRegistry.doctors(did);
            expect(doctor.isActive).to.be.false;
            expect(await doctorRegistry.isDoctorActive(did)).to.be.false;
        });
    });
});
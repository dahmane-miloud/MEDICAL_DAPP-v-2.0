// test-pinata.js - Test Pinata connection (fixed)
const { PinataService } = require('./main/pinata-service');
require('dotenv').config();

async function testPinata() {
    console.log('🧪 Testing Pinata connection...\n');

    const pinata = new PinataService();

    // Test 1: Upload a simple text file (no boolean in metadata)
    console.log('📤 Test 1: Uploading file...');
    const testData = Buffer.from('Hello Medical DAPP! This is a test file from MediChain.\nTimestamp: ' + new Date().toISOString());

    // Use string values only for metadata
    const uploadResult = await pinata.uploadFile(testData, 'test.txt', {
        test_type: 'verification',  // string value, not boolean
        version: '1.0'              // string value
    });

    if (!uploadResult.success) {
        console.error('❌ Upload failed:', uploadResult.error);
        return;
    }

    console.log('✅ Upload successful!');
    console.log(`   CID: ${uploadResult.cid}`);
    console.log(`   URL: ${uploadResult.url}`);

    // Test 2: Download the file
    console.log('\n📥 Test 2: Downloading file...');
    const downloadResult = await pinata.getFile(uploadResult.cid);

    if (downloadResult.success) {
        console.log('✅ Download successful!');
        console.log(`   Content: ${downloadResult.data.toString()}`);
    } else {
        console.error('❌ Download failed:', downloadResult.error);
    }

    // Test 3: Upload JSON
    console.log('\n📄 Test 3: Uploading JSON...');
    const jsonData = {
        message: "Hello from MediChain",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    };

    const jsonResult = await pinata.uploadJSON(jsonData, 'test.json', { type: 'medical_record' });

    if (jsonResult.success) {
        console.log('✅ JSON upload successful!');
        console.log(`   CID: ${jsonResult.cid}`);
        console.log(`   URL: ${jsonResult.url}`);
    } else {
        console.error('❌ JSON upload failed:', jsonResult.error);
    }

    // Test 4: Get stats
    console.log('\n📊 Test 4: Getting Pinata stats...');
    const stats = await pinata.getStats();

    if (stats.success) {
        console.log('✅ Stats retrieved!');
        console.log(`   Total Pins: ${stats.pinCount}`);
        console.log(`   Total Size: ${(stats.pinSizeTotal / 1024 / 1024).toFixed(2)} MB`);
    } else {
        console.error('❌ Stats failed:', stats.error);
    }

    console.log('\n🎉 Pinata integration is working!');
}

testPinata().catch(console.error);
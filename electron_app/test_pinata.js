const axios = require('axios');
const FormData = require('form-data');
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJmZTZhMjdiZi03MDM5LTQ5NzctYTMwNi1jNTQ2Y2YyMjEzYzQiLCJlbWFpbCI6ImlwZnN0ZXN0MkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiNDkyODYwODUzNDVmMTlhZWI0N2QiLCJzY29wZWRLZXlTZWNyZXQiOiJlMmZmZGZlNDAwYjI4ZmE5MDY2OGQ2NWM0MzRiMDI5MDIyYjFiNWI4NGQwMTY2OTA4ZWE1ZjUxMGU4OTExOTM5IiwiZXhwIjoxODExNDg0MDkyfQ.avTD8CQwW8X6dCl4Dw_Cfu8KmL-65-7ErYILs9IoBjM';

(async () => {
  const fd = new FormData();
  fd.append('file', Buffer.from('hello'), { filename: 'test.txt' });
  try {
    const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', fd, {
      headers: { ...fd.getHeaders(), Authorization: `Bearer ${JWT}` },
      maxBodyLength: Infinity,
    });
    console.log('✅ JWT works! CID:', res.data.IpfsHash);
  } catch (e) {
    console.error('❌ JWT failed:', e.response?.status, e.response?.data);
  }
})();